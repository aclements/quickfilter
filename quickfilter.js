// Quickfilter theory of operation
//
// Definitions
// * property - The name of something that can be filtered by.
// * object - A thing that can be matched or not matched.  An object
//   is a map (really a multimap) from properties to values.  It
//   corresponds to an HTML element.
// * filter - A set of selected values for a given property.
// * viable filter - A set of values for a given property that makes
//   sense to offer as selections.
// * value set - For a given property and set of objects, the union of
//   that property's values for those objects.
//
// In the simple case, an object matches a filter for property P if
// the value P for that object is in the filter's set of values.  In
// the general case, we allow a property to have multiple values of an
// object; here an object matches if there is a non-empty intersection
// between the property's values and the filter.
//
// Suppose we have three properties: A, B, and C and the following
// objects match for each property's filter,
//
//   A 1 2
//   B 1   3
//   C 1 2 3 4
//
// The set of matching objects is the intersection of these, so just
// object 1.
//
// Computing viable filters is more interesting.  The viable filter
// for each property comes from the values of objects that match all
// *other* filters.  That is,
//
//   A 1   3
//   B 1 2
//   C 1
//
// Or, from a per-object perspective (which is how we actually
// construct the viable filters): An object that matches all filters
// contributes viable values to all properties; an object that fails
// to match one filter contributes viable values to the filter it
// failed to match; an object that fails to match two or more filters
// doesn't contribute any viable values.

/**
 * Create a filterer.  items is a jQuery collection of HTML elements
 * that should be shown or hidden according to the filter options.
 * filtersDiv is a jQuery reference to the container that the filter
 * UI should be created in.  properties is an array of
 * Quickfilter.Property's to use as filtering properties.
 *
 * The filter can optionally save its state so that a user navigating
 * back to this page will get the filter state they left with (but
 * reloading will reset the filter state).  For this to work,
 * filtersDiv must contain an invisible text input element with class
 * .filter-state.
 */
function Quickfilter(items, filtersDiv, properties) {
    var qfthis = this;
    qfthis._filtersDiv = filtersDiv;

    // Get saved state, if any.  See _saveState for the format.  Why
    // do we use a lame textbox instead of HTML5 history state?
    // Unlike HTLM5 state, this is composable.
    var savedState = null;
    qfthis._stateBox = $(".filter-state", filtersDiv);
    try {
        savedState = $.parseJSON(qfthis._stateBox.val());
    } catch (e) { }

    // Gather object property values
    var objects = [];
    items.each(function() {
        var props = {"_elt": this};
        for (var pi = 0; pi < properties.length; pi++)
            props[properties[pi].name] = properties[pi].fetch(this);
        objects.push(props);
    });
    qfthis._objects = objects;

    // Generate filter tables
    var filters = [];
    for (var pi = 0; pi < properties.length; pi++) {
        var property = properties[pi];
        var name = property.name;
        var filter = {"name": name, "values": []};

        var tableElt = $('<table>').appendTo(filtersDiv);
        tableElt.append($('<tr>').append($('<th colspan="2">').text(name)));

        // Collect the value set of this filter
        var vals = this._valueSet(objects, name, true);

        // Create rows
        for (var i = 0; i < vals.length; i++) {
            // We wrap all td contents with divs so we can
            // slideUp/Down them.
            var checkElt = $('<td><div>&#x2713;</div></td>');
            var rowElt = $('<tr>').append(checkElt).append(
                $('<td>').append(
                    $('<div>').text(vals[i])));
            // Remove td padding because it messes up hidden divs
            $("td", rowElt).css("padding", "0px");
            $("td > div", rowElt).css("padding", "1px");
            tableElt.append(rowElt);
            rowElt.css("cursor", "pointer");

            // Get this value's selected state from the saved state or
            // the initial selections
            var selected = undefined;
            try {
                selected = savedState[name][vals[i]];
            } catch (e) { }
            if (typeof(selected) !== "boolean")
                selected = vals[i] in property.initial;

            // Create value
            var value = {"value": vals[i],
                         "selected": selected,
                         "enabled": true,
                         "tds": $("td", rowElt),
                         "divs": $("div", rowElt),
                         "checkElt": checkElt};
            filter.values.push(value);

            // Handle clicks on this row
            (function(value) {
                rowElt.click(function() {
                    if (!value.enabled)
                        return;
                    // Toggle this value selection
                    value.selected = !value.selected;
                    qfthis._refresh();
                });
            })(value);
        }

        filters.push(filter);
    }

    // Show newly viable values and hide newly non-viable values on
    // mouseleave from the filter UI.  This keeps the UI stable while
    // the user is in it, but also cleans it up when possible.
    filtersDiv.mouseleave(function() {
        for (var i = 0; i < qfthis._filters.length; i++) {
            var filter = qfthis._filters[i];
            for (var j = 0; j < filter.values.length; j++) {
                var value = filter.values[j];
                if (value.enabled)
                    value.divs.slideDown('fast');
                else
                    value.divs.slideUp('fast');
            }
        }
    });

    qfthis._filters = filters;
    qfthis._refresh(true);
}

/**
 * Return the value set of the given property of an array of objects.
 * These properties should be lists.  The returned value set is their
 * union.  If asList, return a sorted list; otherwise, return a set.
 */
Quickfilter.prototype._valueSet = function(objs, prop, asList) {
    var valSet = {};
    for (var oi = 0; oi < objs.length; oi++) {
        var objVals = objs[oi][prop];
        for (var vi = 0; vi < objVals.length; vi++)
            valSet[objVals[vi]] = true;
    }
    if (!asList)
        return valSet;

    var vals = [];
    for (var val in valSet)
        vals.push(val);
    vals.sort();
    return vals;
};

/**
 * Return true if the given filter is disabled (that is, none of its
 * values are selected).
 */
Quickfilter.prototype._filterDisabled = function(filter) {
    for (var i = 0; i < filter.values.length; i++)
        if (filter.values[i].selected)
            return false;
    return true;
};

/**
 * Return true if lst and the keys of set have a non-empty intersection.
 */
Quickfilter.prototype._intersects = function(lst, set) {
    for (var i = 0; i < lst.length; i++)
        if (lst[i] in set)
            return true;
    return false;
};

/**
 * Refresh the filter UI and matched objects based on the current
 * filters.
 */
Quickfilter.prototype._refresh = function(isInit) {
    // Compute selected filter values for each property.  This is map
    // from property names to value sets.  We omit disabled filters.
    var selSets = {};
    for (var i = 0; i < this._filters.length; i++) {
        var filter = this._filters[i];

        if (this._filterDisabled(filter))
            continue;

        selSets[filter.name] = {};
        for (var j = 0; j < filter.values.length; j++)
            if (filter.values[j].selected)
                selSets[filter.name][filter.values[j].value] = true;
    }

    // Update check marks
    for (var i = 0; i < this._filters.length; i++) {
        var filter = this._filters[i];

        // Color each mark.  If this filter is disabled, show them in
        // light gray, since it's like they're all selected.
        var notSelColor = filter.name in selSets ? '#fff' : '#ccc';
        for (var j = 0; j < filter.values.length; j++) {
            var row = filter.values[j];
            row.checkElt.css("color", row.selected ? '#000' : notSelColor);
        }
    }

    // Create empty filter generators for all enabled filters.  A
    // filter generator is the array of objects that match all other
    // filters.
    var filterGenerators = {};
    for (var name in selSets)
        filterGenerators[name] = [];
    var matches = [];

    // Filter objects and find the generators for each filter
    for (var i = 0; i < this._objects.length; i++) {
        // Find the filters this object fails to match
        var object = this._objects[i];
        var failedFilter = null, failedMultiple = false;
        for (var name in selSets) {
            var vals = object[name], sels = selSets[name];
            if (!this._intersects(vals, sels)) {
                if (failedFilter === null) {
                    failedFilter = name;
                } else {
                    failedMultiple = true;
                    break;
                }
            }
        }

        // Keep the object if it matched all filters
        var keep = (failedFilter === null);
        if (isInit) {
            object._elt.style.display = keep ? '' : 'none';
        } else {
            if (keep)
                $(object._elt).slideDown('fast');
            else
                $(object._elt).slideUp('fast');
        }

        // Update filter generators
        if (failedFilter === null) {
            // Use the object as a filter generator for all properties
            // if it matched.
            for (var name in selSets)
                filterGenerators[name].push(object);
            // And remember it so we can update disabled filters
            matches.push(object);
        } else if (failedFilter && !failedMultiple) {
            // Use the object as a filter generator for the failing
            // filter if it failed just one filter.
            filterGenerators[failedFilter].push(object);
        }
    }

    // Update viable filter values
    for (var i = 0; i < this._filters.length; i++) {
        var filter = this._filters[i];
        if (filter.name in filterGenerators)
            // We computed the set of objects that matched all of the
            // other filters above
            var objs = filterGenerators[filter.name];
        else
            // We weren't filtering on this, so the intersection of
            // the other filters is the intersection of all of the
            // filters
            var objs = matches;

        var visSet = this._valueSet(objs, filter.name);
        for (var vi = 0; vi < filter.values.length; vi++) {
            var value = filter.values[vi];
            value.enabled = (value.value in visSet);
            if (isInit) {
                if (!value.enabled)
                    value.divs.hide();
            } else {
                var opacity = value.enabled ? 1 : 0.33;
                value.tds.fadeTo('', opacity);
            }
        }
    }

    // Update saved state
    this._saveState();
};

/**
 * Update the saved filter state so that we can restore it if the user
 * returns to this page in their history.
 */
Quickfilter.prototype._saveState = function() {
    if (!this._stateBox)
        return;

    var state = {};
    for (var fi = 0; fi < this._filters.length; fi++) {
        var filter = this._filters[fi];
        state[filter.name] = {};
        for (var vi = 0; vi < filter.values.length; vi++)
            state[filter.name][filter.values[vi].value] = filter.values[vi].selected;
    }
    this._stateBox.val(JSON.stringify(state));
};

/**
 * Create a Quickfilter property definition.
 *
 * fetch is function that will be called with an element and should
 * return this property's value for that element (either a single
 * value or a list).  As a special case, fetch may instead be a
 * string, which will be used as the name of an XML attribute of the
 * element containing the value.
 *
 * initial, if provided, is a list of initially selected values for
 * this property.
 */
Quickfilter.Property = function (name, fetch, initial) {
    this.name = name;
    if (typeof(fetch) === "string")
        this.fetch = function(elt) { return [elt.getAttribute(fetch)]; };
    else
        this.fetch = function(elt) {
            var val = fetch(elt);
            if (!jQuery.isArray(val))
                val = [val];
            return val;
        };
    this.initial = {};
    if (initial !== undefined) {
        for (var i = 0; i < initial.length; i++)
            this.initial[initial[i]] = true;
    }
}
