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

// Quickfilter theory of operation
//
// Definitions:
//
// * object - A thing that can be matched or not matched.  Quickfilter
//   operates on a collection of objects.  (These are often called
//   "documents" in the literature.)  In Quickfilter, an object
//   generally corresponds to an HTML element, but it can be any
//   JavaScript value.
//
// * facet - An aspect of an object that can be filtered by.  Facets
//   are generally orthogonal and have a relatively small, discrete
//   set of values.  A facet can be viewed as a projection function
//   from objects to values or sets of values.
//
// * filter - Each facet has a corresponding filter that can be
//   manipulated by the user, where the filter is a subset of the
//   possible values for the facet F.  An object O matches a filter if
//   F(O) has a non-empty intersection with the filter (in the simple
//   case, F(O) is just a single value).
//
// * result set - The set of objects that match the filters of all
//   facets in the Quickfilter.
//
// * value set - For a given facet and set of objects, the union of
//   that facet's values for those objects.
//
// * viable values - For a given facet, the value set of the objects
//   that match all the filters of all *other* facets.  These are the
//   values are the "useful" to present as additional choices to the
//   user (adding in a non-viable value will not grow the result set).
//
// For each facet, the user can select any subset of its value set to
// filter on.  Suppose we have three facets (and hence three filters):
// A, B, and C and four objects: 1 -- 4.  Say the user has selected
// values such that the following objects match each facet's filter,
//
//   A: 1 2
//   B: 1   3
//   C: 1 2 3 4
//
// The set of objects that match the Quickfilter is the intersection
// of these; that is, just object 1.
//
// For each facet, the Quickfilter presents the user with only with
// its viable values.  The viable values for each facet are the value
// sets of objects that match the filters for all *other* facets.
// Continuing the above example, the following objects contribute to
// the viable values of the three facets:
//
//   A: 1   3
//   B: 1 2
//   C: 1
//
// Alternatively, from a per-object perspective (which is how we
// actually construct the viable values): An object that matches all
// filters contributes to the viable values for all facets; an object
// that match all but one filter contributes to the viable values of
// the facet that failed to match; an object that fails to match two
// or more filters doesn't contribute any viable values.

'use strict';

/**
 * Create a Quickfilter.  objects is an array-like collection of
 * objects to filter.  filtersDiv is a DOM object or jQuery object for
 * the container that the filter UI should be created in.  facets is
 * an array of Quickfilter.Categorical's to use as filtering facets.
 * Finally, onchange is a function that will be called when the filter
 * changes.  onchange will be passed two arguments: the objects array,
 * and an array of the same length of boolean values indicating
 * whether each object is matched by the current filters.  onchange is
 * also called once by the constructor to apply the initial filter.
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
    var filtersDiv = qf._filtersDiv;
    var nameElt = $('<div>').addClass('quickfilter-name').text(facet.name).
        appendTo(filtersDiv);

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
            appendTo(filtersDiv);
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

    // Show newly viable values and hide newly non-viable values on
    // mouseleave from the filter UI.  This keeps the UI stable while
    // the user is in it, but also cleans it up when possible.
    filtersDiv.mouseleave(function() {
        self._tidyUI();
    });
};

/**
 * "Tidy" this filter's UI by hiding non-viable values.  To keep the
 * UI stable, this should only be called when the mouse is *not* over
 * _qf._filtersDiv.
 */
Quickfilter._CategoricalUI.prototype._tidyUI = function() {
    for (var j = 0; j < this._values.length; j++) {
        var value = this._values[j];
        if (value.viable)
            value.rowElt.slideDown('fast');
        else
            value.rowElt.slideUp('fast');
    }
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
