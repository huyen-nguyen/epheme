if (!org) var org = {};
if (!org.epheme) org.epheme = {};
(function(eo) {
  eo.version = "0.0.0"; // semver
var ns = {

  prefix: {
    svg: "http://www.w3.org/2000/svg",
    xhtml: "http://www.w3.org/1999/xhtml",
    xlink: "http://www.w3.org/1999/xlink",
    xml: "http://www.w3.org/XML/1998/namespace",
    xmlns: "http://www.w3.org/2000/xmlns/"
  },

  resolve: function(prefix) {
    return ns.prefix[prefix] || null;
  },

  qualify: function(name) {
    var i = name.indexOf(":");
    return i < 0 ? name : {
      space: ns.prefix[name.substring(0, i)],
      local: name.substring(i + 1)
    };
  }

};
eo.dispatch = function(that) {
  var types = {};

  that.on = function(type, handler) {
    var listeners = types[type] || (types[type] = []);
    for (var i = 0; i < listeners.length; i++) {
      if (listeners[i].handler == handler) return this; // already registered
    }
    listeners.push({handler: handler, on: true});
    return this;
  };

  that.off = function(type, handler) {
    var listeners = types[type];
    if (listeners) for (var i = 0; i < listeners.length; i++) {
      var l = listeners[i];
      if (l.handler == handler) {
        l.on = false;
        listeners.splice(i, 1);
        break;
      }
    }
    return this;
  };

  that.dispatch = function(event) {
    var listeners = types[event.type];
    if (!listeners) return;
    listeners = listeners.slice(); // defensive copy
    for (var i = 0; i < listeners.length; i++) {
      var l = listeners[i];
      if (l.on) l.handler.call(that, event);
    }
  };

  return that;
};
eo.transform = function() {
  var transform = {},
      actions = [];

  // TODO transitions:
  // duration, delay, etc.
  // per-element delay would be great
  // are transitions scoped, or global?

  // TODO data:
  // is the "full data stack" available as additional arguments?

  // TODO api uncertainty:
  // remove returns select(removed elements)?
  // use sizzle selectors rather than xpath?
  // how to insert or replace elements?
  // how to move elements around, sort, reverse or reorder?

  // TODO performance:
  // text would be more efficient by reusing existing firstChild?
  // optimize arguments to action implementation?

  // Somewhat confusing: these two statements are equivalent:
  //
  //   .data(array)
  //   .data(function(d, i) { return array[i]; })
  //
  // In other words, the array is implicitly dereferenced, similar to Protovis,
  // However, unlike protovis the data property is evaluated per instance,
  // passing in the parent data and the current index. This is largely because
  // the selectors are flattened--the properties are not evaluated with nested
  // recursion as with Protovis, but sequentially.
  //
  // Another side-effect of this design is that the default data property is the
  // identity function, rather than [d]. I'm not sure how this will work with
  // nested data structures. Something to try next!

  // Somewhat confusing: the node name specified to the add and remove methods
  // is not the same as the XPath selector expressions. For example, "#text" is
  // used to create a text node, as this corresponds to the W3C nodeName.
  // However, to select text nodes in XPath, text() is used instead. CSS
  // selectors have the same problem, as #text refers to the ID "text".

  function transform_scope(nodes) {
    var scope = Object.create(transform);

    scope.data = function(v) {
      if (typeof v == "function") {
        actions.push({
          impl: eo_transform_data,
          nodes: nodes,
          value: v
        });
      } else {
        nodes.data = v;
      }
      return scope;
    };

    scope.attr = function(n, v) {
      actions.push({
        impl: eo_transform_attr,
        nodes: nodes,
        name: n,
        value: v
      });
      return scope;
    };

    scope.style = function(n, v, p) {
      actions.push({
        impl: eo_transform_style,
        nodes: nodes,
        name: n,
        value: v,
        priority: arguments.length < 3 ? null : p
      });
      return scope;
    };

    scope.add = function(n, v) {
      var results = [];
      actions.push({
        impl: eo_transform_add,
        nodes: nodes,
        results: results,
        name: n,
        value: v
      });
      return transform_scope(results);
    };

    scope.remove = function(e) {
      actions.push({
        impl: eo_transform_remove,
        nodes: nodes,
        expression: document.createExpression(e, ns.resolve)
      });
      return scope;
    };

    scope.value = function(v) {
      actions.push({
        impl: eo_transform_value,
        nodes: nodes,
        value: v
      });
      return scope;
    };

    scope.text = function(v) {
      scope.remove("text()").add("#text", v);
      return scope; // don't scope
    };

    scope.select = function(e) {
      var results = [];
      actions.push({
        impl: eo_transform_select,
        nodes: nodes,
        results: results,
        expression: document.createExpression(e, ns.resolve)
      });
      return transform_scope(results);
    };

    return scope;
  }

  transform.apply = function() {
    for (var i = 0, n = actions.length; i < n; ++i) actions[i].impl();
    return transform;
  };

  return transform_scope([document]);
};

function eo_transform_attr() {
  var nodes = this.nodes,
      data = nodes.data || empty,
      m = nodes.length,
      n = ns.qualify(this.name),
      v = this.value,
      f = typeof v == "function" && v;
  if (n.space) {
    if (v == null) {
      for (var i = 0; i < m; ++i) {
        nodes[i].removeAttributeNS(n.space, n.local);
      }
    } else if (f) {
      for (var i = 0; i < m; ++i) {
        var o = nodes[i],
            x = v.call(o, data[i], i);
        x == null
            ? o.removeAttributeNS(n.space, n.local)
            : o.setAttributeNS(n.space, n.local, x);
      }
    } else {
      for (var i = 0; i < m; ++i) {
        nodes[i].setAttributeNS(n.space, n.local, v);
      }
    }
  } else if (v == null) {
    for (var i = 0; i < m; ++i) {
      nodes[i].removeAttribute(n);
    }
  } else if (f) {
    for (var i = 0; i < m; ++i) {
      var o = nodes[i],
          x = v.call(o, data[i], i);
      x == null
          ? o.removeAttribute(n)
          : o.setAttribute(n, x);
    }
  } else {
    for (var i = 0; i < m; ++i) {
      nodes[i].setAttribute(n, v);
    }
  }
}

function eo_transform_style() {
  var nodes = this.nodes,
      data = nodes.data || empty,
      m = nodes.length,
      n = ns.qualify(this.name),
      v = this.value,
      f = typeof v == "function" && v,
      p = this.priority;
  if (v == null) {
    for (var i = 0; i < m; ++i) {
      nodes[i].style.removeProperty(n);
    }
  } else if (f) {
    for (var i = 0; i < m; ++i) {
      var o = nodes[i],
          x = v.call(o, data[i], i);
      x == null
          ? o.style.removeProperty(n)
          : o.style.setProperty(n, x, p);
    }
  } else {
    for (var i = 0; i < m; ++i) {
      nodes[i].style.setProperty(n, v, p);
    }
  }
}

function eo_transform_add() {
  var nodes = this.nodes,
      m = nodes.length,
      n = ns.qualify(this.name),
      results = this.results;
  results.length = 0;
  results.data = nodes.data;
  results.parents = nodes;
  if (n.space) {
    for (var i = 0; i < m; ++i) {
      results.push(nodes[i].appendChild(document.createElementNS(n.space, n.local)));
    }
  } else if (n == "#text") {
    var v = this.value,
        f = typeof v == "function" && v;
    if (f) {
      var data = nodes.data || empty;
      for (var i = 0; i < m; ++i) {
        var o = nodes[i],
            x = v.call(o, data[i], i);
        results.push(o.appendChild(document.createTextNode(x)));
      }
    } else {
      for (var i = 0; i < m; ++i) {
        results.push(nodes[i].appendChild(document.createTextNode(v)));
      }
    }
  } else {
    for (var i = 0; i < m; ++i) {
      results.push(nodes[i].appendChild(document.createElement(n)));
    }
  }
}

function eo_transform_remove() {
  var nodes = this.nodes,
      m = nodes.length,
      e = this.expression,
      r = null,
      o;
  for (var i = 0; i < m; ++i) {
    r = e.evaluate(nodes[i], XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, r);
    for (var j = 0, k = r.snapshotLength; j < k; j++) {
      o = r.snapshotItem(j);
      o.parentNode.removeChild(o);
    }
  }
}

function eo_transform_value() {
  var nodes = this.nodes,
      data = nodes.data || empty,
      m = nodes.length,
      v = this.value,
      f = typeof v == "function" && v;
  if (f) {
    for (var i = 0; i < m; ++i) {
      var o = nodes[i],
          x = v.call(o, data[i], i);
      o.nodeValue = x;
    }
  } else {
    for (var i = 0; i < m; ++i) {
      nodes[i].nodeValue = v;
    }
  }
}

function eo_transform_select() {
  var nodes = this.nodes,
      data = nodes.data,
      results = this.results,
      m = nodes.length,
      e = this.expression,
      r = null,
      o;
  results.length = 0;
  results.parents = nodes;
  if (data) {
    results.data = [];
    for (var i = 0; i < m; ++i) {
      r = e.evaluate(nodes[i], XPathResult.UNORDERED_NODE_ITERATOR_TYPE, r);
      while ((o = r.iterateNext()) != null) {
        results.push(o);
        results.data.push(data[i]);
      }
    }
  } else {
    for (var i = 0; i < m; ++i) {
      r = e.evaluate(nodes[i], XPathResult.UNORDERED_NODE_ITERATOR_TYPE, r);
      while ((o = r.iterateNext()) != null) results.push(o);
    }
  }
}

function eo_transform_data() {
  var nodes = this.nodes,
      data = nodes.parents.data || empty,
      results = nodes.data = [],
      m = nodes.length,
      v = this.value;
  for (var i = 0; i < m; ++i) {
    results.push(v.call(nodes[i], data[i], i));
  }
}

var empty = {};
eo.select = function(e) {
  return eo_select(e);
};

function eo_select(e, data) {
  var select = {},
      items;

  // TODO optimize implementation for single-element selections?

  if (arguments.length < 2) data = empty;

  if (typeof e == "string") {
    items = xpath(e, document, []);
  } else if (e instanceof Array) {
    items = e.slice();
  } else {
    items = [e];
  }

  select.select = function(e) {
    return eo_select.apply(null, eo_subselect(items, data, e));
  };

  select.add = function(n) {
    n = ns.qualify(n);
    var children = [];
    if (n.space) {
      for (var i = 0; i < items.length; i++) {
        children.push(items[i].appendChild(document.createElementNS(n.space, n.local)));
      }
    } else {
      for (var i = 0; i < items.length; i++) {
        children.push(items[i].appendChild(document.createElement(n)));
      }
    }
    return eo_select(children, data);
  };

  select.remove = function() {
    for (var i = 0; i < items.length; i++) {
      var e = items[i];
      if (e.parentNode) e.parentNode.removeChild(e);
    }
    return select;
  };

  // TODO select parent / children (convenience functions, using xpath)?

  // TODO argument to value function should be a selector? Alternatively, the
  // selector could track the index internally, and thus calling attr("opacity")
  // would return the value of the opacity attribute on the active node.

  // Or perhaps there's a way to specify the context for elements, so that by
  // default, there's no argument to the value function? And perhaps the map
  // object can override this context to pass in data?

  select.attr = function(n, v) {
    n = ns.qualify(n);
    if (arguments.length < 2) {
      return items.length
          ? (n.space ? items[0].getAttributeNS(n.space, n.local)
          : items[0].getAttribute(n))
          : null;
    }
    if (n.space) {
      if (v == null) {
        for (var i = 0; i < items.length; i++) {
          items[i].removeAttributeNS(n.space, n.local);
        }
      } else if (typeof v == "function") {
        for (var i = 0; i < items.length; i++) {
          var e = items[i],
              x = v.call(select, data[i], i);
          x == null
              ? e.removeAttributeNS(n.space, n.local)
              : e.setAttributeNS(n.space, n.local, x);
        }
      } else {
        for (var i = 0; i < items.length; i++) {
          items[i].setAttributeNS(n.space, n.local, v);
        }
      }
    } else if (v == null) {
      for (var i = 0; i < items.length; i++) {
        items[i].removeAttribute(n);
      }
    } else if (typeof v == "function") {
      for (var i = 0; i < items.length; i++) {
        var e = items[i],
            x = v.call(select, data[i], i);
        x == null
            ? e.removeAttribute(n)
            : e.setAttribute(n, x);
      }
    } else {
      for (var i = 0; i < items.length; i++) {
        items[i].setAttribute(n, v);
      }
    }
    return select;
  };

  select.style = function(n, v, p) {
    if (arguments.length < 2) {
      return items.length
          ? items[0].style.getPropertyValue(n)
          : null;
    }
    if (arguments.length < 3) p = null;
    if (v == null) {
      for (var i = 0; i < items.length; i++) {
        items[i].style.removeProperty(n);
      }
    } else if (typeof v == "function") {
      for (var i = 0; i < items.length; i++) {
        var e = items[i],
            x = v.call(select, data[i], i);
        x == null
            ? e.style.removeProperty(n)
            : e.style.setProperty(n, x, p);
      }
    } else {
      for (var i = 0; i < items.length; i++) {
        items[i].style.setProperty(n, v, p);
      }
    }
    return select;
  };

  // TODO text assumes that there is exactly 1 text node chlid

  select.text = function(v) {
    if (!arguments.length) {
      return items.length && items[0].firstChild
          ? items[0].firstChild.nodeValue
          : null;
    }
    if (v == null) {
      for (var i = 0; i < items.length; i++) {
        var e = items[i];
        if (e.firstChild) e.removeChild(e.firstChild);
      }
    } else if (typeof v == "function") {
      for (var i = 0; i < items.length; i++) {
        var e = items[i],
            x = v.call(select, data[i], i);
        if (x == null) {
          if (e.firstChild) e.removeChlid(e.firstChild);
        } else {
          if (e.firstChild) e.firstChild.nodeValue = x;
          else e.appendChild(document.createTextNode(x));
        }
      }
    } else {
      for (var i = 0; i < items.length; i++) {
        var e = items[i];
        if (e.firstChild) e.firstChild.nodeValue = v;
        else e.appendChild(document.createTextNode(v));
      }
    }
    return select;
  };

  select.length = function() {
    return items.length;
  };

  select.item = function(i) {
    return items[i];
  };

  select.transition = function() {
    return eo_transitioner().select(items, data);
  };

  return select;
};

function xpath(e, c, items) {
  var item,
      results = document.evaluate(
      e, // XPath expression
      c, // context node
      ns.resolve, // namespace resolver
      XPathResult.UNORDERED_NODE_ITERATOR_TYPE, // result type
      null); // result object
  while ((item = results.iterateNext()) != null) items.push(item);
  return items;
}

function eo_subselect(items, data, e) {
  var subitems = [], subdata = empty;
  if (typeof e == "string") {
    if (data === empty) {
      for (var i = 0; i < items.length; i++) {
        xpath(e, items[i] || document, subitems);
      }
    } else {
      subdata = [];
      for (var i = 0, j = 0; i < items.length; i++) {
        xpath(e, items[i] || document, subitems);
        for (var d = data[i]; j < subitems.length; j++) subdata.push(d);
      }
    }
  } else if (typeof e == "number") {
    subitems.push(items[e]);
    subdata = data === empty ? empty : data[e];
  } else {
    subitems = e;
  }
  return [subitems, subdata];
}

var empty = {};
function eo_transitioner() {
  var transitioner = {},
      transition = {},
      repeatInterval = 24,
      repeatDelay = repeatInterval,
      duration = 250,
      ease = eo.ease("cubic-in-out"),
      then,
      triggers = [{t: NaN}],
      tweens = [],
      timer,
      interval;

  // TODO per-element delay? per-element duration? adjustable frame rate?
  // TODO starting and stopping of transitions? merging transitions?

  timer = setTimeout(start, repeatDelay);

  eo.dispatch(transition);

  function start() {
    timer = 0;
    then = Date.now();
    repeat();
    transition.dispatch({type: "start"});
    interval = setInterval(repeat, repeatInterval);
  }

  function repeat() {
    var t = (Date.now() - then) / duration,
        te = ease(t < 0 ? 0 : t > 1 ? 1 : t);
    while (te >= triggers[triggers.length - 1].t) triggers.pop().f();
    for (var i = 0; i < tweens.length; i++) tweens[i](te);
    if (t >= 1) {
      clearInterval(interval);
      interval = 0;
      transition.dispatch({type: "end"});
    }
  }

  // Alternatively, some way of specifying an interpolator when tweening.
  // The interpolator should probably be customizable (e.g., polar).

  function tween(v0, v1) {
    var s0 = String(v0).split(digits),
        s1 = String(v1).split(digits);
    if (s0.length !== s1.length) return;
    var f0 = s0.map(parseFloat),
        f1 = s1.map(parseFloat);
    if (f0.every(isNaN) || f1.every(isNaN)) return;
    return function(t) {
      for (var i = 0; i < f0.length; i++) {
        if (!isNaN(f0[i]) && !isNaN(f1[i])) {
          s1[i] = f0[i] * (1 - t) + f1[i] * t;
        }
      }
      return s1.join("");
    };
  }

  function tweenAttr(e, n, v1) {
    n = ns.qualify(n);
    var f = tween(n.space
        ? e.getAttributeNS(n.space, n.local)
        : e.getAttribute(n), v1);
    if (f) tweens.push(n.space
        ? function(t) { e.setAttributeNS(n.space, n.local, f(t)); }
        : function(t) { e.setAttribute(n, f(t)); });
    else triggers.push({t: .5, f: n.space
        ? function(t) { e.setAttributeNS(n.space, n.local, v1); }
        : function(t) { e.setAttribute(n, v1); }});
  }

  function tweenStyle(e, n, v, p) {
    triggers.push({t: .5, f: function() { eo_select(e).style(n, v, p); }});
  }

  function tweenText(e, v) {
    triggers.push({t: .5, f: function() { eo_select(e).text(v); }});
  }

  transition.duration = function(x) {
    if (!arguments.length) return duration;
    duration = x;
    return this;
  };

  transition.delay = function(x) {
    if (!arguments.length) return repeatDelay;
    repeatDelay = x;
    if (timer) {
      clearInterval(timer);
      timer = setTimeout(start, repeatDelay);
    }
    return this;
  };

  transition.ease = function(x) {
    if (!arguments.length) return ease;
    ease = typeof x == "string" ? eo.ease(x) : x;
    return this;
  };

  transitioner.select = function(items, data) {
    var t = Object.create(transition);

    t.select = function(e) {
      return transitioner.select.apply(null, eo_subselect(items, data, e));
    };

    t.attr = function(n, v) {
      if (typeof v == "function") {
        for (var i = 0; i < items.length; i++) {
          tweenAttr(items[i], n, v.call(t, data[i], i));
        }
      } else {
        for (var i = 0; i < items.length; i++) {
          tweenAttr(items[i], n, v);
        }
      }
      return t;
    };

    t.style = function(n, v, p) {
      if (arguments.length < 3) p = null;
      if (typeof v == "function") {
        for (var i = 0; i < items.length; i++) {
          tweenStyle(items[i], n, v.call(t, data[i], i), p);
        }
      } else {
        for (var i = 0; i < items.length; i++) {
          tweenStyle(items[i], n, v, p);
        }
      }
      return t;
    };

    t.text = function(v) {
      if (typeof v == "function") {
        for (var i = 0; i < items.length; i++) {
          tweenText(items[i], v.call(t, data[i], i));
        }
      } else {
        for (var i = 0; i < items.length; i++) {
          tweenText(items[i], v);
        }
      }
      return t;
    };

    return t;
  };

  return transitioner;
}

var digits = /([-0-9.]+)/;
eo.map = function(data) {
  var map = {},
      from,
      by;

  eo.dispatch(map);

  // TODO defensive copy of data?

  map.from = function(e) {
    if (!arguments.length) return from;
    from = e;
    return map;
  };

  map.by = function(f) {
    if (!arguments.length) return by;
    by = f;
    return map;
  };

  // TODO Should the map object reorder elements to match the data order?
  // Perhaps the map object should have a sort property (or method) that
  // determines (or applies) the desired element order. Alternatively, this
  // could be handled in the `enter` handler.

  // TODO There should be a way to index the existing (from) elements, so that
  // we don't have to do an n^2 equality check to find out which elements need
  // removal. Is there a way to determine the data for the given element?

  map.apply = function(update) {
    if (!arguments.length) update = map.dispatch;

    // TODO merge selections...

    var added = [], addedData = [],
        updated = [], updatedData = [];
    for (var i = 0; i < data.length; i++) {
      var d = data[i],
          s = eo_select(by.call(map, d, i)),
          n = s.length();
      if (n) {
        for (var j = 0; j < n; j++) {
          updated.push(s.item(j));
          updatedData.push(d);
        }
      } else {
        added.push(null);
        addedData.push(d);
      }
    }

    var removed = [], existing = eo_select(from);
    outer: for (var i = 0; i < existing.length(); i++) {
      var e = existing.item(i), found = false;
      for (var j = 0; j < added.length; j++) {
        if (added[j] === e) continue outer;
      }
      for (var j = 0; j < updated.length; j++) {
        if (updated[j] === e) continue outer;
      }
      removed.push(e);
    }

    if (added.length) map.dispatch({type: "enter", target: eo_select(added, addedData)});
    if (updated.length) map.dispatch({type: "update", target: eo_select(updated, updatedData)});
    if (removed.length) map.dispatch({type: "exit", target: eo_select(removed)});
    return map;
  };

  return map;
};
/*
 * TERMS OF USE - EASING EQUATIONS
 *
 * Open source under the BSD License.
 *
 * Copyright 2001 Robert Penner
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * - Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 * - Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * - Neither the name of the author nor the names of contributors may be used to
 *   endorse or promote products derived from this software without specific
 *   prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

var quad = poly(2),
    cubic = poly(3);

var ease = {
  "linear": function() { return linear; },
  "poly": poly,
  "quad": function() { return quad; },
  "cubic": function() { return cubic; },
  "sin": function() { return sin; },
  "exp": function() { return exp; },
  "circle": function() { return circle; },
  "elastic": elastic,
  "back": back,
  "bounce": function() { return bounce; }
};

var mode = {
  "in": function(f) { return f; },
  "out": reverse,
  "in-out": reflect,
  "out-int": function(f) { return reflect(reverse(f)); }
};

eo.ease = function(name) {
  var i = name.indexOf("-"),
      t = i >= 0 ? name.substring(0, i) : name,
      m = i >= 0 ? name.substring(i + 1) : "in";
  return mode[m](ease[t].apply(null, Array.prototype.slice.call(arguments, 1)));
};

function reverse(f) {
  return function(t) {
    return 1 - f(1 - t);
  };
}

function reflect(f) {
  return function(t) {
    return .5 * (t < .5 ? f(2 * t) : (2 - f(2 - 2 * t)));
  };
}

function linear() {
  return t;
}

function poly(e) {
  return function(t) {
    return Math.pow(t, e);
  }
}

function sin(t) {
  return 1 - Math.cos(t * Math.PI / 2);
}

function exp(t) {
  return t ? Math.pow(2, 10 * (t - 1)) - 1e-3 : 0;
}

function circle(t) {
  return 1 - Math.sqrt(1 - t * t);
}

function elastic(a, p) {
  var s;
  if (arguments.length < 2) p = 0.45;
  if (arguments.length < 1) { a = 1; s = p / 4; }
  else s = p / (2 * Math.PI) * Math.asin(1 / a);
  return function(t) {
    return 1 + a * Math.pow(2, 10 * -t) * Math.sin(-(t + s) * 2 * Math.PI / p);
  };
}

function back(s) {
  if (!s) s = 1.70158;
  return function(t) {
    return t * t * ((s + 1) * t - s);
  };
}

function bounce(t) {
  return t < 1 / 2.75 ? 7.5625 * t * t
      : t < 2 / 2.75 ? 7.5625 * (t -= 1.5 / 2.75) * t + .75
      : t < 2.5 / 2.75 ? 7.5625 * (t -= 2.25 / 2.75) * t + .9375
      : 7.5625 * (t -= 2.625 / 2.75) * t + .984375;
}
})(org.epheme);
