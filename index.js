'use strict';

// globals parse
// Licence CC0 1.0 Universal
var ast;
var showParams = true;
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

/*
 Classes
 */

class FuncInfo {
  constructor (parent, name, displayName, objName, paramsString, funcBody) {
    this.parent = parent;
    this.name = name;
    this.displayName = displayName;
    this.objName = objName;
    this.paramsString = paramsString;
    this.funcBody = funcBody;
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

class FunctionObjectCollection {
  constructor () {
    this.funcs = [];
    this.count = 0;
    this.duplicatedNames = '';
    this.anonymousFunctions = 0;
    this.anonymousObjects = 0;
  }

  add (parent, name, displayName, objName, params, funcBody) {
    var paramsString = getParamsString(params);

    this.funcs[this.count] = new FuncInfo(parent, name, displayName, objName, paramsString, funcBody);
    this.count++;

    return this.count - 1;
  }

  findFunctions (parent, tree) {
    let index;
    let name;

    if (tree[0] === 'defun') { // function foo () {
      index = funcsObj.add(parent, tree[1], tree[1], tree[1], tree[2], tree[3]);
      this.findFunctions(index, tree[3]);
      tree[3] = null;
      tree[0] = 'xdefun';
    }
    else if (tree[0] === 'assign' && Array.isArray(tree[3])) { // ?=
      if (tree[3][0] === 'function') { // ? = function () {
        if (getName(parent, tree[2]).found) { // ?.?.? = function () {
          name = getName(parent, tree[2]);

          index = funcsObj.add(parent, name.name, name.displayName, name.objName, tree[3][2], tree[3][3]);
          this.findFunctions(index, tree[3][3]);
          tree[3][3] = null;
          tree[3][0] = 'xfunction';
        }
      }
      else if (tree[3][0] === 'object' && getName(parent, tree[2]).found) {// ?.?.? = object
        name = getName(parent, tree[2]);

        tree[3][1].forEach((node) => {
          if (node[1][0] === 'function') { // foo: function () {
            index = funcsObj.add(parent, node[0], name.displayName + '.' + node[0], name.displayName, node[1][2], node[1][3]);
            this.findFunctions(index, node[1][3]);
            node[1][3] = null;
            node[1][0] = 'xfunction';
          }
        }, this);
      }
    }
    else if (tree[0] === 'var') {
      tree[1].forEach((node) => {
        if (node.length > 1 && node[1][0] === 'function') { // var foo = function () {
          index = funcsObj.add(parent, node[0], node[0], node[0], node[1][2], node[1][3]);

          this.findFunctions(index, node[1][3]);

          node[1][3] = null;
          node[1][0] = 'xfunction';
        }
        else if (node.length > 1 && node[1][0] === 'object') { // search object
          node[1][1].forEach((subnode) => {
            if (subnode[1][0] === 'function') {// foo: function () {
              index = funcsObj.add(parent, subnode[0], node[0] + '.' + subnode[0], node[0], subnode[1][2], subnode[1][3]);
              this.findFunctions(index, subnode[1][3]);
              subnode[1][3] = null;
              subnode[1][0] = 'xfunction';
            }
          }, this);
        }
      }, this);
    }
    else if (tree[0] === 'call' && tree[1][0] === 'function') { // (function ?() {})()
      if (tree[1][1] === null) {
        this.anonymousFunctions += 1;
        name = `[Self calling anonymous function ${this.anonymousFunctions}]`;
        tree[1][1] = name; // give anonymous function a name
        index = funcsObj.add(parent, name, name, name, tree[1][2], tree[1][3]);
      }
      else {
        name = `[Self calling anonymous function ${tree[1][1]}]`;
        index = funcsObj.add(parent, tree[1][1], name, name, tree[1][2], tree[1][3]);
      }

      this.findFunctions(index, tree[1][3]);
      tree[1][3] = null;
      tree[1][0] = 'xfunction';
    }
    else if (tree[0] === 'object' && Array.isArray(tree[1])) { // ?{ object }
      let objName = '';

      tree[1].forEach((node) => {
        if (Array.isArray(node) && Array.isArray(node[1]) && node[1][0] === 'function') { // foo: function () {
          if (objName === '') {
            this.anonymousObjects += 1;
            objName = `[Anonymous object ${this.anonymousObjects}]`;
          }

          index = funcsObj.add(parent, node[0], objName + '.' + node[0], objName, node[1][2], node[1][3]);
          this.findFunctions(index, node[1][3]);
          node[1][3] = null;
          node[1][0] = 'xfunction';
        }
      }, this);
    }
    else if (tree[0] === 'function') {
      if (tree[1] === null) { // ? function () {
        this.anonymousFunctions += 1;
        name = `[Anonymous function ${this.anonymousFunctions}]`;
        index = funcsObj.add(parent, name, name, name, tree[2], tree[3]);
        tree[1] = name; // give function a name?
      }
      else {
        name = `[Anonymous function ${tree[1]}]`;
        index = funcsObj.add(parent, tree[1], name, tree[1], tree[2], tree[3]);
      }

      this.findFunctions(index, tree[3]);
      tree[3] = null;
      tree[0] = 'xfunction';
    }

    tree.forEach((node) => {
      if (Array.isArray(node) && node.length > 0) {
        this.findFunctions(parent, node);
      }
    }, this);
  }

  getIndex (index, obj, name) {
    let findCount = 0;
    let keepI = -1; // not found

    this.funcs.forEach((func, i) => {
      if (name === func.name) {
        findCount++;
        keepI = i;
      }
    }, this);

    if (findCount <= 1) {
      return keepI;
    }
    else if (obj.length) {
      if (obj === 'this') {
        obj = funcsObj.funcs[index].objName;
      }

      for (let i = 0; i < this.count; i++) {
        if (name === this.funcs[i].name && obj === this.funcs[i].objName) {
          return i;
        }
      }
    }

    this.duplicatedNames += `${name} `;

    return -1; // not found
  }

  find_refs () {
    this.funcs.forEach((func, i) => {
      if (Array.isArray(func.funcBody)) {
        this.findRefs(i, func.funcBody);
      }
    }, this);
  }

  findRefs (index, tree) {
    let ref;
    let objName;

    if (tree[0] === 'call' && tree[1][0] === 'name') {
      // Direct function call: `bar()`
      ref = this.getIndex(index, '', tree[1][1]);

      if (ref !== -1) {
        funcsObj.funcs[index].addReference(ref);
        funcsObj.funcs[ref].addReferencedBy(index);
      }
    }
    else if (tree[0] === 'call' && tree[1][0] === 'dot') {
      if (tree[1][2] === 'call' || tree[1][2] === 'apply') {
        if (tree[1][1][0] === 'name') {
          // Function call/apply: `foo.call()` or `foo.apply()`
          ref = this.getIndex(index, '', tree[1][1][1]);

          if (ref !== -1) {
            funcsObj.funcs[index].addReference(ref);
            funcsObj.funcs[ref].addReferencedBy(index);
          }
        }
        else if (tree[1][1][0] === 'dot') {
          // Property method call: `foo.bar.call()`
          if (tree[1][1][1][0] === 'name') {
            objName = tree[1][1][1][1];
          }
          else {
            // Subproperty method call: `obj.foo.bar.call()`
            objName = tree[1][1][1][2];
          }

          ref = this.getIndex(index, objName, tree[1][1][2]);

          if (ref !== -1) {
            funcsObj.funcs[index].addReference(ref);
            funcsObj.funcs[ref].addReferencedBy(index);
          }
        }
      }
      else {
        // Direct method call: `foo.bar()`
        if (tree[1][1][0] === 'name') {
          ref = this.getIndex(index, tree[1][1][1], tree[1][2]);

          if (ref !== -1) {
            funcsObj.funcs[index].addReference(ref);
            funcsObj.funcs[ref].addReferencedBy(index);
          }
        }
        else {
          // Property method call: `foo.bar.call()`
          ref = this.getIndex(index, tree[1][1][2], tree[1][2]);

          if (ref !== -1) {
            funcsObj.funcs[index].addReference(ref);
            funcsObj.funcs[ref].addReferencedBy(index);
          }
        }
      }
    }
    else if (tree[0] === 'call' && tree[1][0] === 'xfunction') {
      // Anonymous Self Invoking Function: `(function () {})()`
      ref = this.getIndex(index, '', tree[1][1]);

      if (ref !== -1) {
        funcsObj.funcs[index].addReference(ref);
        funcsObj.funcs[ref].addReferencedBy(index);
      }
    }
    else if (tree[0] === 'new' && tree[1][0] === 'name') {
      // New instance: `new foo()`
      ref = this.getIndex(index, '', tree[1][1]);

      if (ref !== -1) {
        funcsObj.funcs[index].addReference(ref);
        funcsObj.funcs[ref].addReferencedBy(index);
      }
    }

    tree.forEach((node) => {
      if (Array.isArray(node)) {
        this.findRefs(index, node);
      }
    }, this);
  }

  pointedByNongraphed (index) {
    let obj = this.funcs[index].objName;

    return this.funcs.some((func, i) => {
      return func.objName === obj && this.pointedByNongraphed2(i);
    });
  }

  pointedByNongraphed2 (index) {
    let node = this.funcs[index];
    let objName = node.objName;

    return node.referencedBy.some((ref) => {
      let func = this.funcs[ref];
      let validIndex = ref !== index; // ignore self-referenced
      let validName = objName !== '' && objName !== func.objName;

      return validIndex && validName && !func.graphed;
    }, this);
  }

  pointedByGraphedCount (index) {
    let references = this.funcs[index].referencedBy;

    return references.filter(ref => this.funcs[ref].graphed, this).length;
  }

  ungraphAll () {
    this.funcs = this.funcs.map((func) => {
      func.graphed = func.graphing = false;

      return func;
    });
  }

  getDisplayName (func) {
    if (this.funcs[func].contracted) {
      return  `${this.funcs[func].objName} [Obj]`;
    }
    else {
      return `${this.funcs[func].displayName} ${this.funcs[func].paramsString}`;
    }
  }

  toggleContracted (func) {
    let obj = this.funcs[func];
    let contracted = obj.contracted;
    let name = obj.objName;

    this.funcs = this.funcs.map((fn) => {
      if (fn.objName === name) {
        fn.contracted = !contracted;
      }

      return fn;
    });
  }

  isObject (index) {
    let name = this.funcs[index].objName;

    return this.funcs.some((fn) => {
      return fn.objName === name;
    });
  }
}

class LevelObject {
  constructor () {
    this.funcs = [];
    this.funcsCount = 0;
    this.width = 0;
  }
}

class LevelObjectCollection {
  constructor () {
    this.leftMargin = 50;
    this.rightMargin = 50;
    this.levels = [];
    this.levelsCount = 0;
    this.height = 0;
  }

  createNext () {
    this.levels[this.levelsCount] = new LevelObject();
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
    let i = -1;

    while (++i < this.levelsCount) {
      let level = this.levels[i];

      if (level.funcsCount > this.height) {
        this.height = level.funcsCount;
      }

      let widestNameLength = level.funcs.reduce((widest, func, i) => {
        var displayNameLength = funcsObj.getDisplayName(i).length;

        if (displayNameLength > widest) {
          return displayNameLength;
        }

        return widest;
      }, 0, this);

      this.levels[i].width = this.leftMargin + widestNameLength * 8 + this.rightMargin;
    }
  }

  getWidthUpto (uptoLev) {
    let totalWidth = 0;
    let i = -1;

    while (++i < uptoLev) {
      totalWidth += this.levels[i].width;
    }

    return totalWidth;
  }

  getPos (func) {
    let levelYSpacing;
    let i = -1;

    while (++i < this.levelsCount) {
      if (!funcsObj.funcs[func].contracted) {
        let j = -1;
        let level = this.levels[i];

        while (++j < level.funcsCount) {
          if (level.funcs[j] === func) {
            levelYSpacing = this.height / level.funcsCount;

            return {
              x: this.getWidthUpto(i) + this.leftMargin,
              y: Math.round(j * levelYSpacing * 40 + levelYSpacing * 20 + 20)
            };
          }
        }
      }
      else {
        let j = -1;
        let level = this.levels[i];
        let keepF;
        let matches = 0;

        while (++j < level.funcsCount) {
          if (funcsObj.funcs[level.funcs[j]].objName === funcsObj.funcs[func].objName) {
            matches++;
            keepF = j;
          }
        }

        if (matches === 1) {
          levelYSpacing = this.height / level.funcsCount;

          return {
            x: this.getWidthUpto(i) + this.leftMargin,
            y: Math.round(keepF * levelYSpacing * 40 + levelYSpacing * 20 + 20)
          };
        }
        else if (matches > 1) {
          let matchToUse = Math.floor((matches + 1) / 2);
          let matches = 0;
          let j = -1;

          while (++j < level.funcsCount) {
            if (funcsObj.funcs[level.funcs[j]].objName == funcsObj.funcs[func].objName) {
              matches++;

              if (matches === matchToUse) {
                levelYSpacing = this.height / level.funcsCount;

                return {
                  x: this.getWidthUpto(i) + this.leftMargin,
                  y: Math.round(j * levelYSpacing * 40 + levelYSpacing * 20 + 20)
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
    let done = false;
    let levelsCount = 0;

    levelsObj = new LevelObjectCollection();
    funcsObj.ungraphAll();

    while (!done) {
      done = true;
      let someFound = false;

      levelsObj.createNext();

      funcsObj.funcs.forEach((func, i) => {
        if (!func.graphed) {
          done = false;

          let parent = func.parent;
          let isValidParent = parent === -1 || funcsObj.funcs[parent].graphing;

          if (!funcsObj.pointedByNongraphed(i) && isValidParent) {
            levelsObj.addFunc(levelsCount, i);
            funcsObj.funcs[i].graphing = true;
            someFound = true;
          }
        }
      });

      if (!done && !someFound) {
        let busyHigh = 0;
        let busyest = 0;

        funcsObj.funcs.forEach((func, i) => {
          if (!func.graphed) {
            let busy = funcsObj.pointedByGraphedCount(i) + func.references.length;

            if (busy > busyHigh) {
              busyHigh = busy;
              busyest = i;
            }
          }
        });

        let objName = funcsObj.funcs[busyest].objName;

        funcsObj.funcs.forEach((func, i) => {
          if (func.objName === objName && !func.graphed) {
            // 2nd cond. not needed
            levelsObj.addFunc(levelsCount, i);
            funcsObj.funcs[i].graphing = true;
          }
        });
      }

      funcsObj.funcs = funcsObj.funcs.map((func) => {
        func.graphed = func.graphing;

        return func;
      });

      levelsCount++;
    }

    levelsObj.undoCreateNext();
    levelsObj.findHeightAndWidth();
    levelsObj.sortLevels();
  },

  drawGraph () {
    var divSvg = document.querySelector('#divSvg');
    var graphSvg = document.querySelector('#graphSvg');
    var arrowsEl = document.querySelector('#arrowsEl');
    var textEl = document.querySelector('#textEl');
    var xwidth = levelsObj.getWidthUpto(levelsObj.levelsCount);

    graphSvg.setAttribute('width', Math.min(xwidth * this.scale , 25000));
    graphSvg.setAttribute('height', Math.min((levelsObj.height + 1) * 40 * this.scale , 25000));
    arrowsEl.setAttribute('transform', `scale(${fourDec(this.scale)})`);
    textEl.setAttribute('transform', `scale(${fourDec(this.scale)})`);

    arrowsEl.innerHTML = '';
    textEl.innerHTML = this.getTextNodes();
    divSvg.innerHTML = divSvg.innerHTML; // bug fix

    var arrowNodes = funcsObj.funcs.reduce((prev, func, i) => {
      let pos = levelsObj.getPos(i);
      let nameSize = Math.round(document.querySelector(`#fn${i}`).getBoundingClientRect().width / this.scale);

      let arrowsCoords = func.references.reduce((arrows, next) => {
        let toPos = levelsObj.getPos(next);
        let arrow = this.createArrow(pos.x + nameSize + 8, pos.y, toPos.x - 8, toPos.y);

        return `${arrows} ${arrow}`;
      }, '');

      if (arrowsCoords.length) {
        let color = hslToRgb(Math.random(), Math.random() * 0.4 + 0.3, Math.random() * 0.2 + 0.5);
        let node = `<path style="stroke:${color}" d="${arrowsCoords}"></path>`;

        return `${prev}\n${node}`;
      }

      return prev;
    }, '\n');

    document.querySelector('#export_div').innerHTML = '';
    document.querySelector('#arrowsEl').innerHTML = arrowNodes;

    // bug fix
    divSvg.innerHTML = divSvg.innerHTML;
  },

  getTextNodes () {
    return funcsObj.funcs.reduce((prev, func, i) => {
      let pos = levelsObj.getPos(i);
      let name = funcsObj.getDisplayName(i);
      let y = Math.round(pos.y + 5);

      let node = `<text id="fn${i}" x=${pos.x} y=${y}>${name}</text>`;

      return `${prev}\n${node}`;
    }, '\n');
  },

  changeScale (factor) {
    this.scale *= factor;
    document.querySelector('#display_scale').innerHTML = twoDec(this.scale);
  },

  createArrow (xOrigin, yOrigin, xDest, yDest) {
    var avgx = (xOrigin + xDest) / 2;
    var loopSize = 12;
    var yDiff = 20; // Math.abs(yDest - yOrigin) / 10;
    var lines = [`M ${xOrigin} ${yOrigin}`];

    if (xDest < xOrigin) {
      if (yOrigin === yDest) {
        lines.push(`C ${xOrigin + 20} ${yOrigin}, ${xOrigin + 20} ${yDest - loopSize}, ${xOrigin} ${yDest - loopSize}`);
        lines.push(`L ${xDest} ${yDest - loopSize}`);
        lines.push(`C ${xDest - 20} ${yDest - loopSize}, ${xDest - 20} ${yDest}, ${xDest} ${yDest}`);
      }
      else {
        lines.push(`C ${Math.max(avgx, xOrigin + 150)} ${yOrigin}, ${Math.min(avgx, xDest - 150)} ${yDest}, ${xDest} ${yDest}`);
      }
    }
    else {
      lines.push(`C ${Math.max(avgx, xOrigin + yDiff)} ${yOrigin}, ${Math.min(avgx, xDest - yDiff)} ${yDest}, ${xDest} ${yDest}`);
    }

    lines.push(`M ${xDest - 7} ${yDest - 5} L ${xDest} ${yDest} L ${xDest - 7} ${yDest + 5}`);

    return lines.join(' ');
  }
};

function parseAstFromCode (code) {
  document.querySelector('#warning').innerHTML = '';

  try {
    return parse(code);
  }
  catch (err) {
    document.querySelector('#warning').innerHTML = '*Parsing Error: ' + err + '*';
    console.error(`Parse error: ${err.message}`, err);
  }
}

function updateGraph () {
  ast = parseAstFromCode(document.querySelector('#edit_code').value);

  if (ast) {
    funcsObj = new FunctionObjectCollection();
    funcsObj.add(-1, '[Global]', '[Global]', '[Global]', [], ast[1]);
    funcsObj.findFunctions(0, ast[1]);
    funcsObj.find_refs();

    if (funcsObj.duplicatedNames !== '') {
      document.querySelector('#warning').innerHTML = '*Could not match duplicate function name - graph is incomplete: ' + funcsObj.duplicatedNames + '*';
    }
    else {
      graph.makeGraphData();
      graph.drawGraph();
    }
  }
}

function clickFunc (index) {
  if (funcsObj.isObject(index)) {
    funcsObj.toggleContracted(index);
    updateGraph();
  }
}
