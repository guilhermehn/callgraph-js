//Licence CC0 1.0 Universal
var ast;
var showParams = true;
var anonymousCount;
var anonObjCount;
var funcsObj;
var levelsObj;

function updateGraph() {
  var code = document.getElementById("edit_code").value;
  document.getElementById("warning").innerHTML = "";
  try {
    ast = parse(code);
    funcsObj = new FuncsObj();
    anonymousCount = 0;
    anonObjCount = 0;
    funcsObj.add(-1,"[Global]", "[Global]", "[Global]", [], ast[1], false);
    funcsObj.find_funcs(0,ast[1]);
    funcsObj.find_refs();

    if (funcsObj.duplicated_names != "") {
      document.getElementById("warning").innerHTML = "*Could not match duplicate function name - graph is incomplete: " + funcsObj.duplicated_names + "*";
    }
  }
  catch (err) {
    document.getElementById("warning").innerHTML = "*Parsing Error: "+err+"*";
  }

  graph.make_graph_data();
  graph.draw_graph();
}

function getName (parent, tree) {
  if (tree[0] == "name") {
    return {
      found: true,
      name: tree[1],
      display_name: tree[1],
      obj_name: tree[1]
    };
  }
  else if (tree[0] == "dot" && tree[1][0] == "name") {
    if (tree[1][1] == "this") {
      var obj_name = funcsObj.funcs[parent].name;
      return {
        found: true,
        name: tree[2],
        display_name: obj_name + "." + tree[2],
        obj_name: obj_name
      };
    }
    else {
      return {
        found: true,
        name: tree[2],
        display_name: tree[1][1] + "." + tree[2],
        obj_name: tree[1][1]
      };
    }
  }else if ( tree[0] == "dot" && tree[1][0] == "dot" && tree[1][1][0] == "name" ){
    if (tree[1][2] == "prototype"){
      return {found: true, name: tree[2], display_name: tree[1][1][1]+"."+tree[1][2]+"."+tree[2],
                                        obj_name: tree[1][1][1]};
    }else{
      return {found: true, name: tree[2], display_name: tree[1][1][1]+"."+tree[1][2]+"."+tree[2],
                                obj_name: tree[1][1][1]+"."+tree[1][2]};
    }
  }
  return {found: false};
}

function get_params_string(tree){
  var params = "(";
  for (var p = 0; p<tree.length; p++){
    if (p > 0) {
      params += ",";
    }
    params+= tree[p];
  }
  return params+")";
}

function FuncsObj() {
  this.funcs= [];
  this.count= 0;
  this.duplicated_names = "";
}

FuncsObj.prototype.add = function(parent, name, display_name, obj_name, params, func_body,
                                      showParamsByDefault){
    var params_string = get_params_string(params);
    this.funcs[this.count] = new FuncInfo(parent, name, display_name, obj_name, params_string,
                                    func_body, showParamsByDefault);
    this.count++;
    return this.count-1;
};

FuncsObj.prototype.find_funcs = function(parent,tree){
  if (tree[0] == "defun"){ //function foo() {
    var index = funcsObj.add(parent, tree[1], tree[1], tree[1], tree[2], tree[3], false);
    this.find_funcs(index, tree[3]);
    tree[3] = null;
    tree[0] = "xdefun";
  }else if (tree[0] == "assign" && Array.isArray(tree[3])){//?=
    if (tree[3][0] == "function"){//? = function () {
      if ( getName(parent, tree[2]).found ){ // ?.?.? = function () {
        var getname = getName(parent, tree[2]);
        var index = funcsObj.add(parent, getname.name, getname.display_name, getname.obj_name,
                                      tree[3][2], tree[3][3],false);
        this.find_funcs(index, tree[3][3]);
        tree[3][3] = null;
        tree[3][0] = "xfunction";
      }
    }else if( tree[3][0] == "object" && getName(parent, tree[2]).found ){//?.?.? = object
      var getname = getName(parent, tree[2]);
      for (var p = 0; p<tree[3][1].length; p++){
        if (tree[3][1][p][1][0] == "function" ){// foo: function() {
          var index = funcsObj.add(parent, tree[3][1][p][0], getname.display_name+"."+
                      tree[3][1][p][0], getname.display_name, tree[3][1][p][1][2],
                                        tree[3][1][p][1][3], false);
          this.find_funcs(index, tree[3][1][p][1][3]);
          tree[3][1][p][1][3] = null;
          tree[3][1][p][1][0] = "xfunction";
        }
      }
    }
  }else if (tree[0] == "var"){
    for (var v = 0; v<tree[1].length; v++){
      if( tree[1][v].length>1 && tree[1][v][1][0] == "function"){ //var foo = function() {
        var index = funcsObj.add(parent, tree[1][v][0], tree[1][v][0], tree[1][v][0],
                              tree[1][v][1][2], tree[1][v][1][3], false);
        this.find_funcs(index, tree[1][v][1][3]);
        tree[1][v][1][3] = null;
        tree[1][v][1][0] = "xfunction";
      }else if (tree[1][v].length>1 && tree[1][v][1][0] == "object" ){//search object
        for (var p = 0; p<tree[1][v][1][1].length; p++){
          if (tree[1][v][1][1][p][1][0] == "function" ){// foo: function() {
            var index = funcsObj.add(parent, tree[1][v][1][1][p][0], tree[1][v][0]+"."+
                  tree[1][v][1][1][p][0], tree[1][v][0], tree[1][v][1][1][p][1][2],
                                    tree[1][v][1][1][p][1][3], false);
            this.find_funcs(index, tree[1][v][1][1][p][1][3]);
            tree[1][v][1][1][p][1][3] = null;
            tree[1][v][1][1][p][1][0] = "xfunction";
          }
        }
      }
    }
  }else if (tree[0] == "call" && tree[1][0] == "function"){ //(function ?() {})()
    if (tree[1][1] == null){
      anonymousCount++;
      var name = "[Self calling anonymous function "+anonymousCount+"]";
      tree[1][1] = name; //give anonymous function a name
      var index = funcsObj.add(parent, name, name, name, tree[1][2], tree[1][3], true);
    }else{
      var name = "[Self calling anonymous function "+tree[1][1]+"]";
      var index = funcsObj.add(parent, tree[1][1], name, name, tree[1][2], tree[1][3], false);
    }
    this.find_funcs(index, tree[1][3]);
    tree[1][3] = null;
    tree[1][0] = "xfunction";
  }else if( tree[0] == "object" && Array.isArray(tree[1])){//?{ object }
    var objName = "";
    for (var p = 0; p<tree[1].length; p++){
      if ( Array.isArray(tree[1][p]) && Array.isArray(tree[1][p][1])
                          && tree[1][p][1][0] == "function" ){// foo: function() {
        if (objName == ""){
          anonObjCount++;
          objName = "[Anonymous object "+anonObjCount+"]";
        }
        var index = funcsObj.add(parent, tree[1][p][0], objName+"."+tree[1][p][0], objName,
                  tree[1][p][1][2], tree[1][p][1][3], false);
        this.find_funcs(index, tree[1][p][1][3]);
        tree[1][p][1][3] = null;
        tree[1][p][1][0] = "xfunction";
      }
    }
  }else if (tree[0] == "function" ){
    if ( tree[1] == null){ //? function() {
      anonymousCount++;
      var name = "[Anonymous function "+anonymousCount+"]";
      var index = funcsObj.add(parent, name, name, name, tree[2], tree[3], true);
      tree[1] = name; //give function a name?
      this.find_funcs(index, tree[3]);
      tree[3] = null;
      tree[0] = "xfunction";
    }else{
      var name = "[Anonymous function "+tree[1]+"]";
      var index = funcsObj.add(parent, tree[1], name, tree[1], tree[2], tree[3], false);
      this.find_funcs(index, tree[3]);
      tree[3] = null;
      tree[0] = "xfunction";
    }
  }
  for (var i = 0;i<tree.length;i++){
    if (Array.isArray(tree[i]) && tree[i].length>0){
      this.find_funcs(parent, tree[i]);
    }
  }
}

FuncsObj.prototype.get_index = function(index, obj, name){
    var find_count = 0;
    var keep_i = -1;//not found
    for ( var i = 0; i<this.count; i++ ){
      if (name  ==  this.funcs[i].name){
        find_count++;
        keep_i = i;
      }
    }
    if (find_count <= 1){
      return keep_i;
    }else if (obj != ""){
      if (obj == "this"){
        obj = funcsObj.funcs[index].obj_name;
      }
      for ( var i = 0; i<this.count; i++ ){
        if (name  ==  this.funcs[i].name && obj  ==  this.funcs[i].obj_name){
          return i;
        }
      }
    }
    this.duplicated_names += name+" ";
    return -1;//not found
};

FuncsObj.prototype.find_refs = function() {
    for (var i = 0; i<this.count; i++){
      if (Array.isArray(this.funcs[i].func_body)){
        this.findRefs(i,this.funcs[i].func_body);
      }
    }
};

FuncsObj.prototype.findRefs = function(index,tree){
    if (tree[0] == "call" && tree[1][0] == "name"){ //bar()
      //out += tree[1]+"; ";
      var ref = this.get_index(index, "", tree[1][1]);
      if (ref != -1){
        funcsObj.funcs[index].add_reference(ref);
        funcsObj.funcs[ref].add_referenced_by(index);
      }
    }else if (tree[0] == "call" && tree[1][0] == "dot"){
      if (tree[1][2] == "call" || tree[1][2] == "apply"){
        if (tree[1][1][0] == "name"){ // foo.call() or foo.apply()
          var ref = this.get_index(index, "", tree[1][1][1]);
          if (ref != -1){
            funcsObj.funcs[index].add_reference(ref);
            funcsObj.funcs[ref].add_referenced_by(index);
          }
        }else if (tree[1][1][0] == "dot"){ //?.foo.call()
          if (tree[1][1][1][0] == "name"){ //foo.bar.call()
            var objName = tree[1][1][1][1];
          }else{//?.foo.bar.call()
            var objName = tree[1][1][1][2];
          }
          var ref = this.get_index(index, objName, tree[1][1][2]);
          if (ref != -1){
            funcsObj.funcs[index].add_reference(ref);
            funcsObj.funcs[ref].add_referenced_by(index);
          }
        }
      }else{  //?.bar()
        if (tree[1][1][0] == "name"){ // foo.bar()
          var ref = this.get_index(index, tree[1][1][1], tree[1][2]);
          if (ref != -1){
            funcsObj.funcs[index].add_reference(ref);
            funcsObj.funcs[ref].add_referenced_by(index);
          }
        }else{//?.foo.bar()
          var ref = this.get_index(index, tree[1][1][2], tree[1][2]);
          if (ref != -1){
            funcsObj.funcs[index].add_reference(ref);
            funcsObj.funcs[ref].add_referenced_by(index);
          }
        }
      }
    }else if (tree[0] == "call" && tree[1][0] == "xfunction"){// (function () {})()
      var ref = this.get_index(index, "", tree[1][1]);
      if (ref != -1){
        funcsObj.funcs[index].add_reference(ref);
        funcsObj.funcs[ref].add_referenced_by(index);
      }
    }else if(tree[0] == "new" && tree[1][0] == "name"){ // new foo()
      var ref = this.get_index(index, "", tree[1][1]);
      if (ref != -1){
        funcsObj.funcs[index].add_reference(ref);
        funcsObj.funcs[ref].add_referenced_by(index);
      }
    }
    for (var i = 0;i<tree.length;i++){
      if (Array.isArray(tree[i])){
        this.findRefs(index,tree[i]);
      }
    }
};

FuncsObj.prototype.pointedByNongraphed = function(index){
    var obj = this.funcs[index].obj_name;
    for (var f = 0; f<this.count; f++){
      if (this.funcs[f].obj_name  ==  obj){
        if (this.pointedByNongraphed2(f)){
          return true;
        }
      }
    }
    return false;
};

FuncsObj.prototype.pointedByNongraphed2 = function(index){
    var obj_name = this.funcs[index].obj_name;
    for (var i = 0; i<this.funcs[index].referenced_by.length; i++){
      if (this.funcs[index].referenced_by[i] != index){//ignore self-referenced
        if (obj_name != "" && obj_name != this.funcs[this.funcs[index].referenced_by[i]].obj_name ){
          if (!this.funcs[this.funcs[index].referenced_by[i]].graphed){
            return true;
          }
        }
      }
    }
    return false;
};

FuncsObj.prototype.pointedByGraphedCount = function(index){
    var count = 0;
    for (var i = 0; i<this.funcs[index].referenced_by.length; i++){
      if (this.funcs[this.funcs[index].referenced_by[i]].graphed){
        count++;
      }
    }
    return count;
};

FuncsObj.prototype.ungraph_all = function() {
    for (var f = 0; f<this.count; f++){
      this.funcs[f].graphed = false;
      this.funcs[f].graphing = false;
    }
};

FuncsObj.prototype.get_display_name = function(func){
    if (this.is_contracted(func)){
      return this.funcs[func].obj_name+" [Obj]";
    }else if (showParams || this.funcs[func].showParamsByDefault){
      return this.funcs[func].display_name+this.funcs[func].params_string;
    }else{
      return this.funcs[func].display_name;
    }
};

FuncsObj.prototype.is_contracted = function(func){
    return this.funcs[func].contracted;
};

FuncsObj.prototype.toggle_contracted = function(func){
    var contracted = this.funcs[func].contracted;
    for (var f = 0; f<this.count; f++){
      if (this.funcs[f].obj_name  ==  this.funcs[func].obj_name){
        this.funcs[f].contracted = !contracted;
      }
    }
};

FuncsObj.prototype.is_object = function(func){
    var count_matches = 0;
    for (var f = 0; f<this.count; f++){
      if (this.funcs[f].obj_name  ==  this.funcs[func].obj_name){
        count_matches++;
        if (count_matches > 1){
          return true;
        }
      }
    }
    return false;
};

function FuncInfo(parent,name, display_name, obj_name, params_string, func_body, showParamsByDefault){
  this.parent = parent;
  this.name = name;
  this.display_name = display_name;
  this.obj_name = obj_name;
  this.params_string = params_string;
  this.func_body = func_body;
  this.showParamsByDefault = showParamsByDefault;
  this.references= [];
  this.referenced_by= [];
  this.graphing = false;
  this.graphed = false;
  this.contracted = false;

  this.add_reference = function(ref) {
    this.references.push(ref);
  };

  this.add_referenced_by = function(index) {
    this.referenced_by.push(index);
  };

}

var graph = {
  scale: 1,

  make_graph_data: function() {
    levels_count = 0;
    var done = false;
    levelsObj = new Levels_obj();
    funcsObj.ungraph_all();
    while (!done){
      done = true;
      var some_found = false;
      levelsObj.create_next();
      for (var i = 0; i<funcsObj.count; i++){
        if (!funcsObj.funcs[i].graphed){
          done = false;
          if(!funcsObj.pointedByNongraphed(i)){
            if (funcsObj.funcs[i].parent == -1 ||
                          funcsObj.funcs[funcsObj.funcs[i].parent].graphing){
              levelsObj.add_func(levels_count,i);
              funcsObj.funcs[i].graphing = true;
              some_found = true;
            }
          }
        }
      }
      if (!done && !some_found){
        var busy_high = 0,busyest = 0;
        for (var i = 0; i<funcsObj.count; i++){
          if (!funcsObj.funcs[i].graphed){
            var busy = funcsObj.pointedByGraphedCount(i)+funcsObj.funcs[i].references.length;
            if(busy > busy_high){
              busy_high = busy;
              busyest = i;
            }
          }
        }
        var obj_name = funcsObj.funcs[busyest].obj_name;
        for (var h = 0; h<funcsObj.count; h++){
          if ( funcsObj.funcs[h].obj_name  ==  obj_name && !funcsObj.funcs[h].graphed ){
            //2nd cond. not needed
            levelsObj.add_func(levels_count,h);
            funcsObj.funcs[h].graphing = true;
          }
        }
      }
      for (var i = 0; i<funcsObj.count; i++){
        funcsObj.funcs[i].graphed = funcsObj.funcs[i].graphing;
      }
      levels_count++;
    }
    levelsObj.undo_create_next();
    levelsObj.find_heightandwidth();
    levelsObj.sort_levels();
  },

  draw_graph: function() {
    var div_svg = document.getElementById("div_svg");
    var graph_svg = document.getElementById("graph_svg");
    var arrows_g = document.getElementById("arrows_g");
    var text_g = document.getElementById("text_g");
    var xwidth = levelsObj.get_width_upto(levelsObj.levels_count);
    graph_svg.setAttribute("width",Math.min( xwidth*this.scale , 25000 ));
    graph_svg.setAttribute("height",Math.min( (levelsObj.height+1)*40*this.scale , 25000 ));
    arrows_g.innerHTML = "";
    text_g.innerHTML = "";
    arrows_g.setAttribute("transform","scale("+four_dec(this.scale)+")");
    text_g.setAttribute("transform","scale("+four_dec(this.scale)+")");

    text_g.innerHTML = this.get_text_nodes();
    div_svg.innerHTML = div_svg.innerHTML;//bug fix

    var arrow_nodes = "\n";
    for (var draw_func = 0; draw_func<funcsObj.count; draw_func++){
      var pos = levelsObj.get_pos(draw_func);
      //var name_size = document.getElementById("fn"+draw_func).getBBox().width;
      var name_size = document.getElementById("fn"+draw_func).getBoundingClientRect().width/this.scale;
      name_size = Math.round(name_size);
      var d = "";
      for (var a = 0; a<funcsObj.funcs[draw_func].references.length; a++){
        var to_func = funcsObj.funcs[draw_func].references[a];
        var to_pos = levelsObj.get_pos(to_func);
        d += this.canvas_arrow( pos.x+name_size+8, pos.y, to_pos.x-8, to_pos.y )+" ";
      }
      if (d != ""){
        var color = hsl_to_rgb(Math.random(),Math.random()*0.4+0.3,Math.random()*0.2+0.5);
        var node = '    <path style = "stroke: '+color+'" d = "'+d+'"></path>';
        arrow_nodes += node+"\n";
      }
    }
    document.getElementById('export_div').innerHTML = "";
    document.getElementById("arrows_g").innerHTML = arrow_nodes;
    //document.getElementById("debug").innerHTML += "("+Date.now()+"draw text...)";
    div_svg.innerHTML = div_svg.innerHTML;//bug fix
  },

  get_text_nodes: function() {
    //ctx.miterLimit = 2;
    //ctx.lineJoin = 'circle';
    //ctx.strokeStyle = "White";//'rgb(200,200,200)';
    var text_nodes = "\n";
    for (var draw_func = 0; draw_func<funcsObj.count; draw_func++){
      var pos = levelsObj.get_pos(draw_func);
      var name = funcsObj.get_display_name(draw_func);
      var x = pos.x, y = Math.round(pos.y+5);
      ////ctx.lineWidth = 7;
      ////ctx.strokeText(name, x, y);
      ////ctx.lineWidth = 1;
      ////ctx.fillStyle = "White";
      var node = '    <text id = "fn'+draw_func+'" x = '+x+' y = '+y+' onclick = "click_func('+draw_func+')">'+
                                              name+'</text>';
      text_nodes += node+"\n";
    }
    return text_nodes;
  },

  change_scale: function(factor){
    this.scale *= factor;
    document.getElementById("display_scale").innerHTML = two_dec(this.scale);
  },

  canvas_arrow: function( fromx, fromy, tox, toy ){
      var avgx = (fromx+tox)/2;
      var loop_size = 12;
      var y_diff = 20; //Math.abs(toy-fromy)/10;
      var code = "M "+fromx+" "+fromy;
      if (tox < fromx){
      if (fromy  ==  toy){
        code += " C "+(fromx+20)+" "+fromy+","+(fromx+20)+" "+(toy-loop_size)+","+fromx+" "+
                                            (toy-loop_size);
        code += " L "+tox+" "+(toy-loop_size);
        code += " C "+(tox-20)+" "+(toy-loop_size)+","+(tox-20)+" "+toy+","+tox+" "+toy;
      }else{
        code += " C "+Math.max(avgx,fromx+150)+" "+fromy+","+
                          Math.min(avgx,tox-150)+" "+toy+","+tox+" "+toy;
      }
    }else{
      code += " C "+Math.max(avgx,fromx+y_diff)+" "+fromy+","+
                          Math.min(avgx,tox-y_diff)+" "+toy+","+tox+" "+toy;
    }
      code += " M "+(tox-7)+" "+(toy-5)+" L "+tox+" "+toy+" L "+(tox-7)+" "+(toy+5);
      return code;
  }

}

function Levels_obj() {
  this.left_margin = 50;
  this.right_margin = 50;
  this.levels = [];
  this.levels_count = 0;
  this.height = 0;
}

Levels_obj.prototype.create_next = function() {
    this.levels[this.levels_count] = new Level_obj();
    this.levels_count++;
};

Levels_obj.prototype.undo_create_next = function() {
    this.levels_count--;
    this.levels[this.levels_count] = null;
};

Levels_obj.prototype.add_func = function(level,func){
    this.levels[level].funcs[this.levels[level].funcs_count] = func;
    this.levels[level].funcs_count++;
};

Levels_obj.prototype.find_heightandwidth = function() {
    for (var l = 0; l<(this.levels_count); l++){
      if ( this.get_level_height(l) > this.height ){
        this.height = this.levels[l].funcs_count;
      }
      var widest = 0;
      for (var w = 0; w<this.levels[l].funcs_count; w++){
        var display_name_length = funcsObj.get_display_name(this.levels[l].funcs[w]).length;
        if (display_name_length > widest){
          widest = display_name_length;
        }
      }
      this.levels[l].width = this.left_margin+widest*8+this.right_margin;
    }
};

Levels_obj.prototype.get_level_height = function(lev){
    return this.levels[lev].funcs_count;
};

Levels_obj.prototype.get_width_upto = function(upto_lev){
    var total_width = 0;
    for (var l = 0; l<upto_lev; l++){
      total_width += this.levels[l].width;
    }
    return total_width;
};

Levels_obj.prototype.get_pos = function(func){
    if ( !funcsObj.is_contracted(func) ){
      for (var l = 0; l<this.levels_count; l++){
        for (var f = 0; f<this.levels[l].funcs_count; f++){
          if (this.levels[l].funcs[f]  ==  func){
            var level_y_spacing = this.height / this.levels[l].funcs_count;
            return {x: this.get_width_upto(l)+this.left_margin,
                      y: Math.round(f*level_y_spacing*40+level_y_spacing*20+20)};
          }
        }
      }
    }else{
      for (var l = 0; l<this.levels_count; l++){
        var keep_f;
        var matches = 0;
        for (var f = 0; f<this.levels[l].funcs_count; f++){
          if (funcsObj.funcs[this.levels[l].funcs[f]].obj_name  ==  funcsObj.funcs[func].obj_name){
            matches++;
            keep_f = f;
          }
        }
        if (matches  ==  1){
          var level_y_spacing = this.height / this.levels[l].funcs_count;
          return {x: this.get_width_upto(l)+this.left_margin,
                  y: Math.round(keep_f*level_y_spacing*40+level_y_spacing*20+20)};
        }else if (matches > 1){
          var match_to_use = Math.floor( (matches+1) / 2 );
          var matches2 = 0;
          for (var f = 0; f<this.levels[l].funcs_count; f++){
            if (funcsObj.funcs[this.levels[l].funcs[f]].obj_name ==
                                  funcsObj.funcs[func].obj_name){
              matches2++;
              if (matches2  ==  match_to_use){
                var level_y_spacing = this.height / this.levels[l].funcs_count;
                return {x: this.get_width_upto(l)+this.left_margin,
                      y: Math.round(f*level_y_spacing*40+level_y_spacing*20+20)};
              }
            }
          }
        }
      }
    }
};

Levels_obj.prototype.sort_levels = function() {
    for (var l = 1; l<this.levels_count; l++){
      this.sort_level_br(l);
    }
    for (var l = this.levels_count-2; l >= 0; l--){
      this.sort_level_all(l);
    }
    for (var l = 1; l<this.levels_count; l++){
      this.sort_level_all(l);
    }
    for (var l = this.levels_count-2; l >= 0; l--){
      this.sort_level_all(l);
    }
};

Levels_obj.prototype.sort_level_br = function(lev){
    var temp= [];
    for (var f = 0; f<this.levels[lev].funcs_count; f++){
      var ref_by_count = funcsObj.funcs[this.levels[lev].funcs[f]].referenced_by.length;
      var pos_y_total = 0;
      var pos_y_count = 0;
      for (var r = 0; r<ref_by_count; r++){
        var pos= this.get_pos(funcsObj.funcs[this.levels[lev].funcs[f]].referenced_by[r]);
        if (pos.x < lev){
          pos_y_total+= pos.y;
          pos_y_count++;
        }
      }
      if ( pos_y_count > 0 ){
        ideal_y = pos_y_total/pos_y_count;
      }else{
        ideal_y = this.get_pos(this.levels[lev].funcs[f]).y;
      }
      temp[f]= {func: this.levels[lev].funcs[f], ideal_y: ideal_y};
    }
    temp.sort( function(a,b) {  if (a.ideal_y < b.ideal_y) {return -1;} else {return 1;} } );
    for (var b = 0; b<this.levels[lev].funcs_count; b++){
      this.levels[lev].funcs[b] = temp[b].func;
    }
};

Levels_obj.prototype.sort_level_all = function(lev){
    var temp= [];
    for (var f = 0; f<this.levels[lev].funcs_count; f++){
      var pos_y_total = 0, pos_y_count = 0;
      for (var r = 0; r<funcsObj.funcs[this.levels[lev].funcs[f]].referenced_by.length; r++){
        pos_y_total += this.get_pos(funcsObj.funcs[this.levels[lev].funcs[f]].referenced_by[r]).y;
        pos_y_count++;
      }
      for (var r = 0; r<funcsObj.funcs[this.levels[lev].funcs[f]].references.length; r++){
        pos_y_total += this.get_pos(funcsObj.funcs[this.levels[lev].funcs[f]].references[r]).y;
        pos_y_count++;
      }
      var ideal_y;
      if ( pos_y_count > 0 ){
        ideal_y = pos_y_total/pos_y_count;
      }else{
        ideal_y = this.get_pos(this.levels[lev].funcs[f]).y;
      }
      temp[f]= {func: this.levels[lev].funcs[f], ideal_y: ideal_y};
    }
    temp.sort( function(a,b) {  if (a.ideal_y < b.ideal_y) {return -1;} else {return 1;} } );
    for (var b = 0; b<this.levels[lev].funcs_count; b++){
      this.levels[lev].funcs[b] = temp[b].func;
    }
};

function Level_obj() {
  this.funcs = [];
  this.funcs_count = 0;
  this.width = 0;
}

function click_func(func){
  if ( funcsObj.is_object(func) ){
    funcsObj.toggle_contracted(func);
    updateGraph();
  }
}

function two_dec(n){  return Math.round(n*100)/100;  }
function four_dec(n){  return Math.round(n*10000)/10000;  }

function hsl_to_rgb(h, s, l){
    var r, g, b;

    if(s  ==  0){
        r = g = b = l;
    }else{
        function hue2rgb(p, q, t){
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return "rgb("+Math.round(r * 255)+","+Math.round(g * 255)+","+Math.round(b * 255)+")";
}

function export_svg() {
  var text = 'Copy and paste to following text into a new file and save as .svg';
  text += '<textarea style = "width: 100%;" rows = 20 wrap = "logical"><?xml version = "1.0"?>';
  text += document.getElementById('div_svg').innerHTML+'</textarea>';

  //var svgwin = window.open("", "Function Graph"+Math.floor(Math.random()*1000)+".html");
  //svgwin.document.write(document.getElementById('div_svg').innerHTML);

  document.getElementById('export_div').innerHTML = text;
}
