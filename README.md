Quickfilter is a simple, lean, client-side JavaScript faceted search UI.

Quickfilter combines free text search of unstructured data and faceted
navigation of structured data for interactive, intuitive, and powerful
filtering of large data sets.  Since Quickfilter is entirely
client-side, it responds instantly to update the result set and
dynamically narrow available facet values to what's relevant for the
current result set.


Features
--------

* Drop-in faceted filtering and search for any array-like collection,
  including collections of DOM elements.

* Easily fetch facet value from HTML5 `data-` attributes or compute
  facet values using arbitrary code.

* Support for categorical and free text facets.

* Free text queries support quoted phrases and fields.

* Accent folding for free text search makes it easy to search
  non-English text and names.

* Support for saving state over navigation.

* Simple styling with CSS.  Twitter Bootstrap compatible.


Requirements
------------

Quickfilter requires jQuery >= 1.7.


Theory of operation
-------------------

Definitions:

* object - A thing that can be matched or not matched.  Quickfilter
  operates on a collection of objects.  (These are often called
  "documents" in the literature.)  In Quickfilter, an object
  generally corresponds to an HTML element, but it can be any
  JavaScript value.

* facet - An aspect of an object that can be filtered by.  Facets
  are generally orthogonal and have a relatively small, discrete
  set of values.  A facet can be viewed as a projection function
  from objects to values or sets of values.

* filter - Each facet has a corresponding filter that can be
  manipulated by the user, where the filter is a subset of the
  possible values for the facet F.  An object O matches a filter if
  F(O) has a non-empty intersection with the filter (in the simple
  case, F(O) is just a single value).

* result set - The set of objects that match the filters of all
  facets in the Quickfilter.

* value set - For a given facet and set of objects, the union of
  that facet's values for those objects.

* viable values - For a given facet, the value set of the objects
  that match all the filters of all *other* facets.  These are the
  values are the "useful" to present as additional choices to the
  user (adding in a non-viable value will not grow the result set).

For each facet, the user can select any subset of its value set to
filter on.  Suppose we have three facets (and hence three filters):
A, B, and C and four objects: 1 -- 4.  Say the user has selected
values such that the following objects match each facet's filter,

    A: 1 2
    B: 1   3
    C: 1 2 3 4

The set of objects that match the Quickfilter is the intersection
of these; that is, just object 1.

For each facet, the Quickfilter presents the user with only with
its viable values.  The viable values for each facet are the value
sets of objects that match the filters for all *other* facets.
Continuing the above example, the following objects contribute to
the viable values of the three facets:

    A: 1   3
    B: 1 2
    C: 1

Alternatively, from a per-object perspective (which is how we
actually construct the viable values): An object that matches all
filters contributes to the viable values for all facets; an object
that match all but one filter contributes to the viable values of
the facet that failed to match; an object that fails to match two
or more filters doesn't contribute any viable values.


Future directions
-----------------

* Continuous facets

* Better handling of missing facet values

* Custom sorts for facet values

* Better handling of large facet domains

* Better handling of large numbers of facets

* Consider using object ID arrays instead of boolean array for result
  sets (though the added complexity may outweigh the asymptotic
  benefits).
