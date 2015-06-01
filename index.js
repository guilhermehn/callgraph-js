'use strict';

// globals parse
// Licence CC0 1.0 Universal
var ast;
var showParams = true;
var anonymousCount;
var anonObjCount;
var funcsObj;
var levelsObj;

/*
 Helpers
 */

function sortByIdealY (a, b) {
  if (a.idealY < b.idealY) {
    return -1;
  }
  else {
    return 1;
  }
}

function hue2rgb (p, q, t) {
  if (t < 0) {
    t += 1;
  }

  if (t > 1) {
    t -= 1;
  }

  if (t < 1 / 6) {
    return p + (q - p) * 6 * t;
  }

  if (t < 1 / 2) {
    return q;
  }

  if (t < 2 / 3) {
    return p + (q - p) * (2 / 3 - t) * 6;
  }

  return p;
}

function getName (parent, tree) {
  if (tree[0] === 'name') {
    return {
      found: true,
      name: tree[1],
      displayName: tree[1],
      objName: tree[1]
    };
  }
  else if (tree[0] === 'dot' && tree[1][0] === 'name') {
    if (tree[1][1] === 'this') {
      var objName = funcsObj.funcs[parent].name;

      return {
        found: true,
        name: tree[2],
        displayName: objName + '.' + tree[2],
        objName: objName
      };
    }
    else {
      return {
        found: true,
        name: tree[2],
        displayName: tree[1][1] + '.' + tree[2],
        objName: tree[1][1]
      };
    }
  }
  else if (tree[0] === 'dot' && tree[1][0] === 'dot' && tree[1][1][0] === 'name') {
    if (tree[1][2] === 'prototype') {
      return {
        found: true,
        name: tree[2],
        displayName: tree[1][1][1] + '.' + tree[1][2] + '.' + tree[2],
        objName: tree[1][1][1]
      };
    }
    else {
      return {
        found: true,
        name: tree[2],
        displayName: tree[1][1][1] + '.' + tree[1][2] + '.' + tree[2],
        objName: tree[1][1][1] + '.' + tree[1][2]
      };
    }
  }

  return {
    found: false
  };
}

function getParamsString (tree) {
  var params = '(';
  var p = 0;

  for (; p < tree.length; p++) {
    if (p > 0) {
      params += ', ';
    }

    params += tree[p];
  }

  return params + ')';
}

function twoDec (n) {
  return Math.round(n * 100) / 100;
}

function fourDec (n) {
  return Math.round(n * 10000) / 10000;
}

function hslToRgb (h, s, l) {
  var r;
  var g;
  var b;

  if (s === 0) {
    r = g = b = l;
  }
  else {
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return 'rgb(' + Math.round(r * 255) + ', ' + Math.round(g * 255) + ', ' + Math.round(b * 255) + ')';
}

function exportSvg () {
  var text = 'Copy and paste to following text into a new file and save as .svg';
  text += '<textarea style="width: 100%;" rows=20 wrap="logical"><?xml version="1.0"?>';
  text += document.getElementById('divSvg').innerHTML + '<\/textarea>';

  // var svgwin = window.open('', 'Function Graph'+Math.floor(Math.random()*1000)+'.html');
  // svgwin.document.write(document.getElementById('divSvg').innerHTML);

  document.getElementById('export_div').innerHTML = text;
}

/*
 Classes
 */

class FuncInfo {
  constructor (parent, name, displayName, objName, paramsString, funcBody, showParamsByDefault) {
    this.parent = parent;
    this.name = name;
    this.displayName = displayName;
    this.objName = objName;
    this.paramsString = paramsString;
    this.funcBody = funcBody;
    this.showParamsByDefault = showParamsByDefault;
    this.references = [];
    this.referencedBy = [];
    this.graphing = false;
    this.graphed = false;
    this.contracted = false;
  }

  addReference (ref) {
    this.references.push(ref);
  }

  addReferencedBy (index) {
    this.referencedBy.push(index);
  }
}

class FuncsObj {
  constructor () {
    this.funcs = [];
    this.count = 0;
    this.duplicatedNames = '';
  }

  add (parent, name, displayName, objName, params, funcBody, showParamsByDefault) {
    var paramsString = getParamsString(params);

    this.funcs[this.count] = new FuncInfo(parent, name, displayName, objName, paramsString, funcBody, showParamsByDefault);
    this.count++;

    return this.count - 1;
  }

  findFuncs (parent, tree) {
    var index;
    var name;
    var p;

    if (tree[0] === 'defun') { // function foo () {
      index = funcsObj.add(parent, tree[1], tree[1], tree[1], tree[2], tree[3], false);
      this.findFuncs(index, tree[3]);
      tree[3] = null;
      tree[0] = 'xdefun';
    }
    else if (tree[0] === 'assign' && Array.isArray(tree[3])) { // ?=
      if (tree[3][0] === 'function') { // ? = function () {
        if (getName(parent, tree[2]).found) { // ?.?.? = function () {
          var getname = getName(parent, tree[2]);
          index = funcsObj.add(parent, getname.name, getname.displayName, getname.objName, tree[3][2], tree[3][3], false);
          this.findFuncs(index, tree[3][3]);
          tree[3][3] = null;
          tree[3][0] = 'xfunction';
        }
      }
      else if (tree[3][0] === 'object' && getName(parent, tree[2]).found) {// ?.?.? = object
        var getname = getName(parent, tree[2]);

        for (p = 0; p < tree[3][1].length; p++) {
          if (tree[3][1][p][1][0] === 'function') {// foo: function () {
            index = funcsObj.add(parent, tree[3][1][p][0], getname.displayName + '.' + tree[3][1][p][0], getname.displayName, tree[3][1][p][1][2], tree[3][1][p][1][3], false);
            this.findFuncs(index, tree[3][1][p][1][3]);
            tree[3][1][p][1][3] = null;
            tree[3][1][p][1][0] = 'xfunction';
          }
        }
      }
    }
    else if (tree[0] === 'var') {
      for (var v = 0; v < tree[1].length; v++) {
        if (tree[1][v].length > 1 && tree[1][v][1][0] === 'function') { // var foo = function () {
          index = funcsObj.add(parent, tree[1][v][0], tree[1][v][0], tree[1][v][0], tree[1][v][1][2], tree[1][v][1][3], false);

          this.findFuncs(index, tree[1][v][1][3]);

          tree[1][v][1][3] = null;
          tree[1][v][1][0] = 'xfunction';
        }
        else if (tree[1][v].length > 1 && tree[1][v][1][0] === 'object') {// search object
          for (p = 0; p < tree[1][v][1][1].length; p++) {
            if (tree[1][v][1][1][p][1][0] === 'function') {// foo: function () {
              index = funcsObj.add(parent, tree[1][v][1][1][p][0], tree[1][v][0] + '.' + tree[1][v][1][1][p][0], tree[1][v][0], tree[1][v][1][1][p][1][2], tree[1][v][1][1][p][1][3], false);
              this.findFuncs(index, tree[1][v][1][1][p][1][3]);
              tree[1][v][1][1][p][1][3] = null;
              tree[1][v][1][1][p][1][0] = 'xfunction';
            }
          }
        }
      }
    }
    else if (tree[0] === 'call' && tree[1][0] === 'function') { // (function ?() {})()
      if (tree[1][1] === null) {
        anonymousCount++;
        name = '[Self calling anonymous function ' + anonymousCount + ']';
        tree[1][1] = name; // give anonymous function a name
        index = funcsObj.add(parent, name, name, name, tree[1][2], tree[1][3], true);
      }
      else {
        name = '[Self calling anonymous function ' + tree[1][1] + ']';
        index = funcsObj.add(parent, tree[1][1], name, name, tree[1][2], tree[1][3], false);
      }
      this.findFuncs(index, tree[1][3]);
      tree[1][3] = null;
      tree[1][0] = 'xfunction';
    }
    else if (tree[0] === 'object' && Array.isArray(tree[1])) { // ?{ object }
      var objName = '';
      for (p = 0; p < tree[1].length; p++) {
        if (Array.isArray(tree[1][p]) && Array.isArray(tree[1][p][1]) && tree[1][p][1][0] === 'function') { // foo: function () {
          if (objName === '') {
            anonObjCount++;
            objName = '[Anonymous object ' + anonObjCount + ']';
          }
          index = funcsObj.add(parent, tree[1][p][0], objName + '.' + tree[1][p][0], objName, tree[1][p][1][2], tree[1][p][1][3], false);
          this.findFuncs(index, tree[1][p][1][3]);
          tree[1][p][1][3] = null;
          tree[1][p][1][0] = 'xfunction';
        }
      }
    }
    else if (tree[0] === 'function') {
      if (tree[1] === null) { // ? function () {
        anonymousCount++;
        name = '[Anonymous function ' + anonymousCount + ']';
        index = funcsObj.add(parent, name, name, name, tree[2], tree[3], true);
        tree[1] = name; // give function a name?
        this.findFuncs(index, tree[3]);
        tree[3] = null;
        tree[0] = 'xfunction';
      }
      else {
        name = '[Anonymous function ' + tree[1] + ']';
        index = funcsObj.add(parent, tree[1], name, tree[1], tree[2], tree[3], false);
        this.findFuncs(index, tree[3]);
        tree[3] = null;
        tree[0] = 'xfunction';
      }
    }
    for (var i = 0;i < tree.length;i++) {
      if (Array.isArray(tree[i]) && tree[i].length > 0) {
        this.findFuncs(parent, tree[i]);
      }
    }
  }

  getIndex (index, obj, name) {
    var findCount = 0;
    var keepI = -1; // not found
    var i = 0;

    for (i = 0; i < this.count; i++) {
      if (name === this.funcs[i].name) {
        findCount++;
        keepI = i;
      }
    }

    if (findCount <= 1) {
      return keepI;
    }
    else if (obj !== '') {
      if (obj === 'this') {
        obj = funcsObj.funcs[index].objName;
      }

      for (i = 0; i < this.count; i++) {
        if (name === this.funcs[i].name && obj === this.funcs[i].objName) {
          return i;
        }
      }
    }

    this.duplicatedNames += name + ' ';

    return -1; // not found
  }

  find_refs () {
    for (var i = 0; i < this.count; i++) {
      if (Array.isArray(this.funcs[i].funcBody)) {
        this.findRefs(i, this.funcs[i].funcBody);
      }
    }
  }

  findRefs (index, tree) {
    var ref;
    var objName;

    if (tree[0] === 'call' && tree[1][0] === 'name') { // bar()
      // out += tree[1]+'; ';
      ref = this.getIndex(index, '', tree[1][1]);
      if (ref !== -1) {
        funcsObj.funcs[index].addReference(ref);
        funcsObj.funcs[ref].addReferencedBy(index);
      }
    }
    else if (tree[0] === 'call' && tree[1][0] === 'dot') {
      if (tree[1][2] === 'call' || tree[1][2] === 'apply') {
        if (tree[1][1][0] === 'name') { // foo.call() or foo.apply()
          ref = this.getIndex(index, '', tree[1][1][1]);
          if (ref !== -1) {
            funcsObj.funcs[index].addReference(ref);
            funcsObj.funcs[ref].addReferencedBy(index);
          }
        }
        else if (tree[1][1][0] === 'dot') { // ?.foo.call()
          if (tree[1][1][1][0] === 'name') { // foo.bar.call()
            objName = tree[1][1][1][1];
          }
          else {// ?.foo.bar.call()
            objName = tree[1][1][1][2];
          }
          ref = this.getIndex(index, objName, tree[1][1][2]);
          if (ref !== -1) {
            funcsObj.funcs[index].addReference(ref);
            funcsObj.funcs[ref].addReferencedBy(index);
          }
        }
      }
      else {  // ?.bar()
        if (tree[1][1][0] === 'name') { // foo.bar()
          ref = this.getIndex(index, tree[1][1][1], tree[1][2]);
          if (ref !== -1) {
            funcsObj.funcs[index].addReference(ref);
            funcsObj.funcs[ref].addReferencedBy(index);
          }
        }
        else {// ?.foo.bar()
          ref = this.getIndex(index, tree[1][1][2], tree[1][2]);
          if (ref !== -1) {
            funcsObj.funcs[index].addReference(ref);
            funcsObj.funcs[ref].addReferencedBy(index);
          }
        }
      }
    }
    else if (tree[0] === 'call' && tree[1][0] === 'xfunction') {// (function () {})()
      ref = this.getIndex(index, '', tree[1][1]);
      if (ref !== -1) {
        funcsObj.funcs[index].addReference(ref);
        funcsObj.funcs[ref].addReferencedBy(index);
      }
    }
    else if (tree[0] === 'new' && tree[1][0] === 'name') { // new foo()
      ref = this.getIndex(index, '', tree[1][1]);
      if (ref !== -1) {
        funcsObj.funcs[index].addReference(ref);
        funcsObj.funcs[ref].addReferencedBy(index);
      }
    }
    for (var i = 0;i < tree.length;i++) {
      if (Array.isArray(tree[i])) {
        this.findRefs(index, tree[i]);
      }
    }
  }

  pointedByNongraphed (index) {
    var obj = this.funcs[index].objName;
    for (var f = 0; f < this.count; f++) {
      if (this.funcs[f].objName === obj) {
        if (this.pointedByNongraphed2(f)) {
          return true;
        }
      }
    }
    return false;
  }

  pointedByNongraphed2 (index) {
    var objName = this.funcs[index].objName;
    for (var i = 0; i < this.funcs[index].referencedBy.length; i++) {
      if (this.funcs[index].referencedBy[i] !== index) {// ignore self-referenced
        if (objName !== '' && objName !== this.funcs[this.funcs[index].referencedBy[i]].objName) {
          if (!this.funcs[this.funcs[index].referencedBy[i]].graphed) {
            return true;
          }
        }
      }
    }
    return false;
  }

  pointedByGraphedCount (index) {
    var count = 0;
    for (var i = 0; i < this.funcs[index].referencedBy.length; i++) {
      if (this.funcs[this.funcs[index].referencedBy[i]].graphed) {
        count++;
      }
    }
    return count;
  }

  ungraphAll () {
    for (var f = 0; f < this.count; f++) {
      this.funcs[f].graphed = false;
      this.funcs[f].graphing = false;
    }
  }

  getDisplayName (func) {
    if (this.isContracted(func)) {
      return this.funcs[func].objName + ' [Obj]';
    }
    else if (showParams || this.funcs[func].showParamsByDefault) {
      return this.funcs[func].displayName + this.funcs[func].paramsString;
    }
    else {
      return this.funcs[func].displayName;
    }
  }

  isContracted (func) {
    return this.funcs[func].contracted;
  }

  toggleContracted (func) {
    var contracted = this.funcs[func].contracted;
    for (var f = 0; f < this.count; f++) {
      if (this.funcs[f].objName === this.funcs[func].objName) {
        this.funcs[f].contracted = !contracted;
      }
    }
  }

  isObject (func) {
    var countMatches = 0;

    for (var f = 0; f < this.count; f++) {
      if (this.funcs[f].objName === this.funcs[func].objName) {
        countMatches++;
        if (countMatches > 1) {
          return true;
        }
      }
    }

    return false;
  }
}

class LevelObj {
  constructor () {
    this.funcs = [];
    this.funcsCount = 0;
    this.width = 0;
  }
}

class LevelsObj {
  constructor () {
    this.leftMargin = 50;
    this.rightMargin = 50;
    this.levels = [];
    this.levelsCount = 0;
    this.height = 0;
  }

  createNext () {
    this.levels[this.levelsCount] = new LevelObj();
    this.levelsCount++;
  }

  undoCreateNext () {
    this.levelsCount--;
    this.levels[this.levelsCount] = null;
  }

  addFunc (level, func) {
    this.levels[level].funcs[this.levels[level].funcsCount] = func;
    this.levels[level].funcsCount++;
  }

  findHeightAndWidth () {
    for (var l = 0; l < (this.levelsCount); l++) {
      if (this.getLevelHeight(l) > this.height) {
        this.height = this.levels[l].funcsCount;
      }
      var widest = 0;
      for (var w = 0; w < this.levels[l].funcsCount; w++) {
        var displayNameLength = funcsObj.getDisplayName(this.levels[l].funcs[w]).length;
        if (displayNameLength > widest) {
          widest = displayNameLength;
        }
      }
      this.levels[l].width = this.leftMargin + widest * 8 + this.rightMargin;
    }
  }

  getLevelHeight (lev) {
    return this.levels[lev].funcsCount;
  }

  getWidthUpto (uptoLev) {
    var totalWidth = 0;
    for (var l = 0; l < uptoLev; l++) {
      totalWidth += this.levels[l].width;
    }
    return totalWidth;
  }

  getPos (func) {
    var l;
    var f;
    var levelYSpacing;

    if (!funcsObj.isContracted(func)) {
      for (l = 0; l < this.levelsCount; l++) {
        for (f = 0; f < this.levels[l].funcsCount; f++) {
          if (this.levels[l].funcs[f] === func) {
            levelYSpacing = this.height / this.levels[l].funcsCount;
            return {
              x: this.getWidthUpto(l) + this.leftMargin,
              y: Math.round(f * levelYSpacing * 40 + levelYSpacing * 20 + 20)
            };
          }
        }
      }
    }
    else {
      for (l = 0; l < this.levelsCount; l++) {
        var keepF;
        var matches = 0;
        for (f = 0; f < this.levels[l].funcsCount; f++) {
          if (funcsObj.funcs[this.levels[l].funcs[f]].objName === funcsObj.funcs[func].objName) {
            matches++;
            keepF = f;
          }
        }
        if (matches === 1) {
          levelYSpacing = this.height / this.levels[l].funcsCount;
          return {
            x: this.getWidthUpto(l) + this.leftMargin,
            y: Math.round(keepF * levelYSpacing * 40 + levelYSpacing * 20 + 20)
          };
        }
        else if (matches > 1) {
          var matchToUse = Math.floor((matches + 1) / 2);
          var matches2 = 0;
          for (f = 0; f < this.levels[l].funcsCount; f++) {
            if (funcsObj.funcs[this.levels[l].funcs[f]].objName ==
                                  funcsObj.funcs[func].objName) {
              matches2++;
              if (matches2 === matchToUse) {
                levelYSpacing = this.height / this.levels[l].funcsCount;
                return {
                  x: this.getWidthUpto(l) + this.leftMargin,
                  y: Math.round(f * levelYSpacing * 40 + levelYSpacing * 20 + 20)
                };
              }
            }
          }
        }
      }
    }
  }

  sortLevels () {
    var l;

    for (l = 1; l < this.levelsCount; l++) {
      this.sortLevelBr(l);
    }

    for (l = this.levelsCount - 2; l >= 0; l--) {
      this.sortLevelSll(l);
    }

    for (l = 1; l < this.levelsCount; l++) {
      this.sortLevelSll(l);
    }

    for (l = this.levelsCount - 2; l >= 0; l--) {
      this.sortLevelSll(l);
    }
  }

  sortLevelBr (lev) {
    var temp = [];
    var idealY;

    for (var f = 0; f < this.levels[lev].funcsCount; f++) {
      var refByCount = funcsObj.funcs[this.levels[lev].funcs[f]].referencedBy.length;
      var posYTotal = 0;
      var posYCount = 0;

      for (var r = 0; r < refByCount; r++) {
        var pos = this.getPos(funcsObj.funcs[this.levels[lev].funcs[f]].referencedBy[r]);

        if (pos.x < lev) {
          posYTotal += pos.y;
          posYCount++;
        }
      }

      if (posYCount > 0) {
        idealY = posYTotal / posYCount;
      }
      else {
        idealY = this.getPos(this.levels[lev].funcs[f]).y;
      }
      temp[f] = {
        func: this.levels[lev].funcs[f],
        idealY: idealY
      };
    }

    temp.sort(sortByIdealY);

    for (var b = 0; b < this.levels[lev].funcsCount; b++) {
      this.levels[lev].funcs[b] = temp[b].func;
    }
  }

  sortLevelSll (lev) {
    var temp = [];
    var r;

    for (var f = 0; f < this.levels[lev].funcsCount; f++) {
      var posYTotal = 0;
      var posYCount = 0;

      for (r = 0; r < funcsObj.funcs[this.levels[lev].funcs[f]].referencedBy.length; r++) {
        posYTotal += this.getPos(funcsObj.funcs[this.levels[lev].funcs[f]].referencedBy[r]).y;
        posYCount++;
      }

      for (r = 0; r < funcsObj.funcs[this.levels[lev].funcs[f]].references.length; r++) {
        posYTotal += this.getPos(funcsObj.funcs[this.levels[lev].funcs[f]].references[r]).y;
        posYCount++;
      }

      var idealY;

      if (posYCount > 0) {
        idealY = posYTotal / posYCount;
      }
      else {
        idealY = this.getPos(this.levels[lev].funcs[f]).y;
      }

      temp[f] = {
        func: this.levels[lev].funcs[f],
        idealY: idealY
      };
    }

    temp.sort(sortByIdealY);

    for (var b = 0; b < this.levels[lev].funcsCount; b++) {
      this.levels[lev].funcs[b] = temp[b].func;
    }
  }
}

/*
 Main
 */

var graph = {
  scale: 1,

  makeGraphData () {
    var i;
    var done = false;

    var levelsCount = 0;
    levelsObj = new LevelsObj();
    funcsObj.ungraphAll();

    while (!done) {
      done = true;
      let someFound = false;
      levelsObj.createNext();

      i = -1;

      while (++i < funcsObj.count) {
        if (!funcsObj.funcs[i].graphed) {
          done = false;

          let parent = funcsObj.funcs[i].parent;
          let isValidParent = parent === -1 || funcsObj.funcs[parent].graphing;

          if (!funcsObj.pointedByNongraphed(i) && isValidParent) {
            levelsObj.addFunc(levelsCount, i);
            funcsObj.funcs[i].graphing = true;
            someFound = true;
          }
        }
      }

      if (!done && !someFound) {
        var busyHigh = 0;
        var busyest = 0;

        i = -1;

        while (++i < funcsObj.count) {
          if (!funcsObj.funcs[i].graphed) {
            var busy = funcsObj.pointedByGraphedCount(i) + funcsObj.funcs[i].references.length;

            if (busy > busyHigh) {
              busyHigh = busy;
              busyest = i;
            }
          }
        }

        let objName = funcsObj.funcs[busyest].objName;

        i = -1;

        while (++i < funcsObj.count) {
          if (funcsObj.funcs[i].objName === objName && !funcsObj.funcs[i].graphed) {
            // 2nd cond. not needed
            levelsObj.addFunc(levelsCount, i);
            funcsObj.funcs[i].graphing = true;
          }
        }
      }

      i = -1;

      while (++i < funcsObj.count) {
        funcsObj.funcs[i].graphed = funcsObj.funcs[i].graphing;
      }

      levelsCount++;
    }

    levelsObj.undoCreateNext();
    levelsObj.findHeightAndWidth();
    levelsObj.sortLevels();
  },

  drawGraph () {
    var divSvg = document.getElementById('divSvg');
    var graphSvg = document.getElementById('graphSvg');
    var arrowsEl = document.getElementById('arrowsEl');
    var textEl = document.getElementById('textEl');
    var xwidth = levelsObj.getWidthUpto(levelsObj.levelsCount);

    graphSvg.setAttribute('width', Math.min(xwidth * this.scale , 25000));
    graphSvg.setAttribute('height', Math.min((levelsObj.height + 1) * 40 * this.scale , 25000));
    arrowsEl.setAttribute('transform', 'scale(' + fourDec(this.scale) + ')');
    textEl.setAttribute('transform', 'scale(' + fourDec(this.scale) + ')');

    arrowsEl.innerHTML = '';
    textEl.innerHTML = this.getTextNodes();
    divSvg.innerHTML = divSvg.innerHTML; // bug fix

    var arrowNodes = '\n';
    var i = -1;

    while (++i < funcsObj.count) {
      let pos = levelsObj.getPos(i);
      let nameSize = Math.round(document.getElementById('fn' + i).getBoundingClientRect().width / this.scale);
      // var nameSize = document.getElementById('fn'+i).getBBox().width;

      let d = funcsObj.funcs[i].references.reduce((prev, next, i) => {
        let toPos = levelsObj.getPos(next);
        let result = this.canvasArrow(pos.x + nameSize + 8, pos.y, toPos.x - 8, toPos.y);

        return `${prev} ${result}`;
      }, '');

      if (d !== '') {
        var color = hslToRgb(Math.random(), Math.random() * 0.4 + 0.3, Math.random() * 0.2 + 0.5);
        var node = '<path style="stroke: ' + color + '" d="' + d + '"></path>';
        arrowNodes += node + '\n';
      }
    }

    document.getElementById('export_div').innerHTML = '';
    document.getElementById('arrowsEl').innerHTML = arrowNodes;

    // bug fix
    divSvg.innerHTML = divSvg.innerHTML;
  },

  getTextNodes () {
    var textNodes = '\n';

    for (var drawFunc = 0; drawFunc < funcsObj.count; drawFunc++) {
      var pos = levelsObj.getPos(drawFunc);
      var name = funcsObj.getDisplayName(drawFunc);
      var x = pos.x;
      var y = Math.round(pos.y + 5);
      var node = '<text id="fn' + drawFunc + '" x=' + x + ' y=' + y + ' onclick="clickFunc(' + drawFunc + ')">' + name + '</text>';
      textNodes += node + '\n';
    }

    return textNodes;
  },

  changeScale (factor) {
    this.scale *= factor;
    document.getElementById('display_scale').innerHTML = twoDec(this.scale);
  },

  canvasArrow (fromx, fromy, tox, toy) {
    var avgx = (fromx + tox) / 2;
    var loopSize = 12;
    var yDiff = 20; // Math.abs(toy-fromy)/10;
    var lines = [['M', fromx, fromy].join(' ')];

    if (tox < fromx) {
      if (fromy === toy) {
        lines.push(['C', fromx + 20, fromy, ',', fromx + 20, toy - loopSize, ',', fromx, toy - loopSize].join(' '));
        lines.push(['L', tox, toy - loopSize].join(' '));
        lines.push(['C', tox - 20, toy - loopSize, ',', tox - 20, toy, ',', tox, toy].join(' '));
      }
      else {
        lines.push(['C', Math.max(avgx, fromx + 150), fromy, ',', Math.min(avgx, tox - 150), toy, ',', tox, toy].join(' '));
      }
    }
    else {
      lines.push(['C', Math.max(avgx, fromx + yDiff), fromy, ',', Math.min(avgx, tox - yDiff), toy, ',', tox, toy].join(' '));
    }

    lines.push(['M', tox - 7, toy - 5, 'L', tox, toy, 'L', tox - 7, toy + 5].join(' '));

    return lines.join(' ');
  }
};

function updateGraph () {
  var code = document.getElementById('edit_code').value;
  document.getElementById('warning').innerHTML = '';

  try {
    ast = parse(code);
    funcsObj = new FuncsObj();
    anonymousCount = 0;
    anonObjCount = 0;
    funcsObj.add(-1, '[Global]', '[Global]', '[Global]', [], ast[1], false);
    funcsObj.findFuncs(0, ast[1]);
    funcsObj.find_refs();

    if (funcsObj.duplicatedNames !== '') {
      document.getElementById('warning').innerHTML = '*Could not match duplicate function name - graph is incomplete: ' + funcsObj.duplicatedNames + '*';
    }
  }
  catch (err) {
    document.getElementById('warning').innerHTML = '*Parsing Error: ' + err + '*';
  }

  graph.makeGraphData();
  graph.drawGraph();
}

function clickFunc (func) {
  if (funcsObj.isObject(func)) {
    funcsObj.toggleContracted(func);
    updateGraph();
  }
}
