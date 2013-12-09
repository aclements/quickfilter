// Quickfilter is a simple, lean, client-side faceted search UI.
//
// Copyright (c) 2013 Austin T. Clements
//
// Permission is hereby granted, free of charge, to any person
// obtaining a copy of this software and associated documentation
// files (the "Software"), to deal in the Software without
// restriction, including without limitation the rights to use, copy,
// modify, merge, publish, distribute, sublicense, and/or sell copies
// of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
// BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
// CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

'use strict';

/**
 * Create a Quickfilter.  objects is an array-like collection of
 * objects to filter.  filtersDiv is a DOM object or jQuery object for
 * the container that the filter UI should be created in.  facets is
 * an array of Quickfilter.Categorical's or Quickfilter.FreeText's to
 * use as filtering facets.  Finally, onchange is a function that will
 * be called when the filter changes.  onchange will be passed two
 * arguments: the objects array, and an array of the same length of
 * boolean values indicating whether each object is matched by the
 * current filters.  onchange is also called once by the constructor
 * to apply the initial filter.
 *
 * Typically, objects will be a collection of DOM objects, and
 * onchange will modify their visibility, but nothing in Quickfilter
 * requires this.
 *
 * The filter can optionally save its state so that a user navigating
 * back to this page will get the filter state they left with (but
 * reloading will reset the filter state).  For this to work,
 * filtersDiv must contain an invisible text input element with class
 * .filter-state (this must be in the HTML, not added by JavaScript,
 * or it will defeat the whole mechanism).
 */
function Quickfilter(objects, filtersDiv, facets, onchange) {
    this._filtersDiv = filtersDiv = $(filtersDiv);

    this._objects = objects;
    this._facets = facets;
    this._onchange = onchange;

    // Get saved state, if any.  See _saveState for the format.  Why
    // do we use a lame textbox instead of HTML5 history state?
    // Unlike HTLM5 state, this is composable.  (And we didn't want to
    // push history entries anyway.)
    var savedState = {};
    this._stateBox = $('.filter-state', filtersDiv);
    try {
        savedState = $.parseJSON(this._stateBox.val());
    } catch (e) { }

    this._filters = [];
    for (var i = 0; i < facets.length; i++)
        this._filters.push(
            facets[i]._createFilter(this, savedState[facets[i].name]));
    this._refresh(true);
}

/**
 * Refresh the filter UI and matched objects based on the current
 * filters.
 */
Quickfilter.prototype._refresh = function(isInit) {
    // Get predicates for each filter
    var preds = new Array(this._filters.length);
    for (var i = 0; i < this._filters.length; i++)
        preds[i] = this._filters[i].makePredicate();

    // Apply filters to find matched set and single-miss filters
    var matched = new Array(this._objects.length);
    var missed = new Array(this._objects.length);
    for (var i = 0; i < this._objects.length; i++) {
        // Find the filters this object fails to match
        var objMissed = null, nmissed = 0;
        for (var pi = 0; pi < preds.length && nmissed < 2; pi++) {
            if (!preds[pi](i)) {
                objMissed = this._filters[pi];
                ++nmissed;
            }
        }

        matched[i] = (nmissed === 0);
        if (nmissed === 1)
            missed[i] = objMissed;
    }

    // Update filter UIs
    for (var i = 0; i < this._filters.length; i++)
        this._filters[i].refresh(isInit, matched, missed);

    // Update saved state
    this._saveState();

    // Call onchange
    this._onchange(this._objects, matched);
};

/**
 * Update the saved filter state so that we can restore it if the user
 * returns to this page in their history.
 */
Quickfilter.prototype._saveState = function() {
    if (!this._stateBox)
        return;

    var state = {};
    for (var i = 0; i < this._filters.length; i++)
        state[this._facets[i].name] = this._filters[i].getSaveState();
    this._stateBox.val(JSON.stringify(state));
};

/**
 * Create a Quickfilter facet for a categorical (discrete) property.
 *
 * proj is projection function that will be applied to each object in
 * the Quickfilter's collection to retrieve this facet's value for
 * that object (either a single string or a list of strings).  As a
 * special case, proj may instead be a string, in which case the
 * projection will retrieve the named XML attribute from each object.
 *
 * initial, if provided, is a list of initially selected values for
 * this facet.
 */
Quickfilter.Categorical = function (name, proj, initial) {
    this.name = name;
    if (typeof(proj) === 'string')
        this.proj = function(elt) { return [elt.getAttribute(proj)]; };
    else
        this.proj = function(elt) {
            var val = proj(elt);
            if (!jQuery.isArray(val))
                val = [val];
            return val;
        };
    this.initial = {};
    if (initial !== undefined) {
        for (var i = 0; i < initial.length; i++)
            this.initial[initial[i]] = true;
    }
};

/**
 * Create and return a filter UI for this facet.
 *
 * qf is the Quickfilter instance to get objects from and to add the
 * UI to.  savedState is the saved state of this filter, or undefined
 * if there is no saved state.
 */
Quickfilter.Categorical.prototype._createFilter = function(qf, savedState) {
    return new Quickfilter._CategoricalUI(this, qf, savedState);
};

Quickfilter._CategoricalUI = function(facet, qf, savedState) {
    var self = this;
    this._qf = qf;

    // Gather object facet values
    var objVals = new Array(qf._objects.length);
    for (var i = 0; i < qf._objects.length; i++)
        objVals[i] = facet.proj(qf._objects[i]);
    this._objVals = objVals;

    // Create filter UI
    var uiDiv = $('<div>');
    var nameElt = $('<div>').addClass('quickfilter-name').text(facet.name).
        appendTo(uiDiv);
    this._nameElt = nameElt;

    // Collect the value set of this filter
    var valSet = {};
    for (var i = 0; i < objVals.length; i++)
        for (var j = 0; j < objVals[i].length; j++)
            valSet[objVals[i][j]] = true;
    var vals = [];
    for (var val in valSet)
        if (Object.prototype.hasOwnProperty.call(valSet, val))
            vals.push(val);
    vals.sort();

    // Create rows
    var values = [];
    for (var i = 0; i < vals.length; i++) {
        var rowElt = $('<div>').text(vals[i]).addClass('quickfilter-value').
            attr('tabindex', '0').appendTo(uiDiv);
        var checkElt = $('<span>&#x2713;</span>').
            addClass('quickfilter-check').prependTo(rowElt);

        // Get this value's selected state from the saved state or the
        // initial selections
        var selected = undefined;
        try {
            selected = savedState[vals[i]];
        } catch (e) { }
        if (typeof(selected) !== 'boolean')
            selected = Object.prototype.hasOwnProperty.call(facet.initial, vals[i]);

        // Create value
        var value = {'value': vals[i],
                     'selected': selected,
                     'viable': true,
                     'rowElt': rowElt,
                     'checkElt': checkElt};
        values.push(value);

        // Handle clicks on this row
        (function(value) {
            rowElt.click(function() {
                if (!value.viable)
                    return;
                // Toggle this value selection
                value.selected = !value.selected;
                qf._refresh();
            });
        })(value);
    }
    this._values = values;
    uiDiv.on('keyup', function(ev) {
        if (ev.which === 13)
            $(ev.target).click();
    });

    qf._filtersDiv.append(uiDiv);

    // Show newly viable values and hide newly non-viable values on
    // mouseleave from the filter UI.  This keeps the UI stable while
    // the user is in it, but also cleans it up when possible.
    qf._filtersDiv.mouseleave(function() {
        self._tidyUI();
    });
};

/**
 * "Tidy" this filter's UI by hiding non-viable values.  To keep the
 * UI stable, this should only be called when the mouse is *not* over
 * _qf._filtersDiv.
 */
Quickfilter._CategoricalUI.prototype._tidyUI = function() {
    var anyViable = false;
    for (var j = 0; j < this._values.length; j++) {
        var value = this._values[j];
        anyViable = anyViable || value.viable;
        if (value.viable)
            value.rowElt.slideDown('fast');
        else
            value.rowElt.slideUp('fast');
    }
    if (anyViable)
        this._nameElt.slideDown('fast');
    else
        this._nameElt.slideUp('fast');
};

/**
 * Return true if the filter is pass-all (that is, in the UI, no
 * values are selected).
 */
Quickfilter._CategoricalUI.prototype._isPassAll = function() {
    for (var i = 0; i < this._values.length; i++)
        if (this._values[i].selected)
            return false;
    return true;
}

/**
 * Return a predicate function that takes an object index and returns
 * whether the object matches the filter.
 */
Quickfilter._CategoricalUI.prototype.makePredicate = function() {
    var self = this;

    // If no values are selected, then this filter allows everything.
    if (this._isPassAll())
        return function() { return true; };

    // Get selected filter values
    var selValues = {};
    for (var i = 0; i < this._values.length; i++)
        if (this._values[i].selected)
            selValues[this._values[i].value] = true;

    // Create predicate
    return function(obji) {
        // Test if object i's values insect with selected values
        var objVals = self._objVals[obji];
        for (var i = 0; i < objVals.length; i++)
            if (Object.prototype.hasOwnProperty.call(selValues, objVals[i]))
                return true;
        return false;
    };
};

/**
 * Refresh this filter UI.  isInit indicates whether this is the
 * initial refresh (so animations should be suppressed).  matched is
 * an array of booleans indicating which objects matched all filters.
 * missed is an array indicating which single filter object failed to
 * match each object (or a false value if zero or more than one failed
 * to match).
 */
Quickfilter._CategoricalUI.prototype.refresh = function(isInit, matched, missed) {
    // Update check marks.  If this filter is disabled, shade them in
    // light gray, since it's like they're all selected.
    var notSelOpacity = this._isPassAll() ? '0.25' : '0';
    for (var i = 0; i < this._values.length; i++) {
        var row = this._values[i];
        row.checkElt.css('opacity', row.selected ? '1' : notSelOpacity);
    }

    // Compute viable value set
    var viableVals = {};
    for (var i = 0; i < matched.length; i++) {
        if (matched[i] || missed[i] === this) {
            // This object contributes viable values to this filter
            for (var j = 0; j < this._objVals[i].length; j++)
                viableVals[this._objVals[i][j]] = true;
        }
    }

    // Refresh viable rows
    for (var i = 0; i < this._values.length; i++) {
        var value = this._values[i];
        value.viable = Object.prototype.hasOwnProperty.call(viableVals, value.value);
        if (isInit) {
            if (!value.viable)
                value.rowElt.hide();
        } else {
            if (value.viable)
                value.rowElt.removeClass('quickfilter-value-nonviable');
            else
                value.rowElt.addClass('quickfilter-value-nonviable');
        }
    }

    // If the mouse isn't over the Quickfilter, tidy immediately
    // rather than waiting for the mouse to leave
    if (!this._qf._filtersDiv.is(':hover'))
        this._tidyUI();
};

/**
 * Return the state to save for this filter.
 */
Quickfilter._CategoricalUI.prototype.getSaveState = function() {
    var state = {};
    for (var i = 0; i < this._values.length; i++)
        state[this._values[i].value] = this._values[i].selected;
    return state;
};

/**
 * Create a Quickfilter free text search.
 *
 * proj is a projection function that will be applied to each object
 * in the Quickfilter's collection.  It must return a string that will
 * be used for free text search.
 *
 * initial, if provided, is an initial search query to use.
 */
Quickfilter.FreeText = function(name, proj, initial) {
    this.name = name;
    this.proj = proj;
    this.initial = initial;
};

Quickfilter.FreeText.prototype._createFilter = function(qf, savedState) {
    return new Quickfilter._FreeTextUI(this, qf, savedState);
};

Quickfilter._FreeTextUI = function(facet, qf, savedState) {
    this._facet = facet;
    this._qf = qf;
    this._index = null;

    // The form-control class is used by Twitter Bootstrap
    var inputDiv = $('<input type="search">').attr('placeholder', facet.name).
        addClass('form-control').appendTo(qf._filtersDiv);
    this._inputDiv = inputDiv;

    // Handle saved/initial state
    var initial = savedState || facet.initial;
    if (initial)
        this._inputDiv.val(initial);

    // Update the filter as the user types
    var timeout = null;
    inputDiv.on('keyup', function(ev) {
        if (timeout === null) {
            timeout = setTimeout(
                function() {
                    timeout = null;
                    qf._refresh();
                }, 50);
        }
    });
};

/**
 * Parse text into tokens.  Tokens are lower-cased.  If the text ends
 * with a token not followed by any other text, 'prefix' in the
 * returned object is set to that token.
 */
Quickfilter._FreeTextUI.prototype._parse = function(text) {
    var re = /\w+/g;
    var haveToks = {}, toks = [];
    var m, prefix = null;
    // Case-fold and accent-fold the text
    text = Quickfilter._accentFold(text.toLocaleLowerCase());
    while ((m = re.exec(text)) !== null) {
        var tok = m[0];
        if (!Object.prototype.hasOwnProperty.call(haveToks, tok)) {
            toks.push(tok);
            haveToks[tok] = true;
        }
        if (re.lastIndex === text.length)
            prefix = tok;
    }
    return {toks: toks, prefix: prefix};
};

Quickfilter._FreeTextUI.prototype.makePredicate = function() {
    var query = this._parse(this._inputDiv.val());

    if (query.toks.length === 0)
        return function() { return true; };

    // If this is the first search, index the objects
    if (this._index === null) {
        this._index = new Array(this._qf._objects.length);
        for (var i = 0; i < this._qf._objects.length; i++) {
            var text = this._facet.proj(this._qf._objects[i]);
            this._index[i] = this._parse(text).toks.join(' ') + ' ';
        }
    }

    // Build the index strings to search for
    var probes = new Array(query.toks.length);
    for (var i = 0; i < query.toks.length; i++) {
        if (query.prefix === query.toks[i])
            probes[i] = query.toks[i];
        else
            probes[i] = query.toks[i] + ' ';
    }

    // Create predicate
    var index = this._index;
    return function(obji) {
        for (var i = 0; i < probes.length; i++)
            if (index[obji].indexOf(probes[i]) === -1)
                return false;
        return true;
    }
};

Quickfilter._FreeTextUI.prototype.refresh = function() { };

Quickfilter._FreeTextUI.prototype.getSaveState = function() {
    return this._inputDiv.val();
};

/**
 * Unicode accent-folding function for free text search (generated by
 * mkfold)
 */
Quickfilter._accentFold = (function() {
    var map = [["",768,1,-78,2,1,-31,276,1,-4,266,1,-44,2,2,1,2,1,2,73,1,-10,49,1,-20,17,102,1,-6,3,1,-5,3,1,2,1,-3,36,31,1,-26,161,1,-8,35,1,-3,2,1,-8,2,1,1,2,1,-4,44,1,1,137,1,-26,62,17,4,1,-3,104,17,111,17,111,17,111,17,128,128,8,1,102,17,128,125,110,1,1,14,1,-3,109,1,15,1,-3,77,1,28,2,2,56,1,2,6,1,-3,3,2,1,1,2,1,63,113,2,1,83,720,1,1,949,32,158,11,204,144,1,1,220,1,72,21,1,-7,3,181,16,39,1,-8,55,1,59,12,1,68,153,1,1,2,1,-12,2,1,-6,5,7,204,1,-38,22,1,-3,721,1,-12,5,4,1,-11,3071,1,1,142,97,1,-31,555,1,-5,106,1,30165,5,1,-9,34,81,1,277,190,28,1,-17,58,1,1,38,96,13,240,2,1,1,3,1,6,1,2,53,247,20273,770,1,-6],["a",170,54,1,-5,28,2,2,201,17,2,26,6,2,36,6917,23,190,160,2,-11,473,1088,55921],["b",7470,25,188,2,2,1738,55921],["c",231,32,2,-3,7311,109,884,853,55921],["d",271,7201,24,195,2,-4,819,56,853,55921],["e",232,1,-3,40,2,-4,234,2,34,6920,24,204,2,-4,156,2,-7,458,158,24,909,55921],["f",7584,127,1718,55921],["g",285,2,-3,196,14,6974,26,212,745,972,55921],["h",293,250,145,6788,239,2,-4,107,511,121,969,55921],["i",236,1,-3,58,2,-3,161,57,2,6954,45,203,2,154,2,422,200,15,40,872,55921],["j",309,187,194,6788,1043,912,1955,53966],["k",311,178,6990,24,226,2,2,609,1092,55921],["l",314,2,2,419,6743,255,2,-3,602,124,105,863,55921],["m",7481,23,239,2,2,597,231,861,55921],["n",241,83,2,2,177,6977,267,2,-3,564,26,1092,55921],["o",186,56,1,-4,87,2,2,80,49,25,2,32,2,28,2,-3,6923,22,251,2,-3,122,2,-11,431,162,938,55921],["p",7486,24,255,2,579,1093,55921],["q",9440,55921],["r",341,2,2,184,2,160,6796,36,246,2,-3,1666,55921],["s",347,2,-3,30,154,201,7039,2,-4,50,512,1095,55921],["t",355,2,182,6949,23,276,2,-3,38,517,1095,55921],["u",249,1,-3,109,2,-5,61,36,2,-4,57,2,6954,23,12,271,2,-4,106,2,-6,1523,55921],["v",7515,10,280,2,757,881,1944,53977],["w",373,322,6795,319,2,-4,15,1614,55921],["x",739,7080,2,518,230,878,55921],["y",253,2,120,188,133,7127,10,90,2,-3,1519,55921],["z",378,2,2,7229,214,2,2,1620,55921]];
    // Create regexp and canonicalizer table
    var restr = '';
    var canon = {};
    for (var i = 0; i < map.length; i++) {
        var charCodes = [];
        for (var j = 1; j < map[i].length;)
            if (map[i][j] >= 0)
                charCodes.push(map[i][j++])
            else
                charCodes.push((map[i][j]++, map[i][j-1]));
        for (var j = 1; j < charCodes.length; j++)
            charCodes[j] += charCodes[j-1];
        for (var j = 0; j < charCodes.length; j++) {
            var source = String.fromCharCode(charCodes[j]);
            restr += source;
            canon[source] = map[i][0];
        }
    }
    var regexp = new RegExp('[' + restr + ']', 'g');
    return function(string) {
        return string.replace(regexp, function(c) { return canon[c]; });
    };
})();
