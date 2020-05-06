import cytoscape from "cytoscape";

var vsp_graph;
var dataSet;

var graphNodeIds;
// e(d) -> s(d)
var graphEdge_depot;
// s(d) -> d(t)
var graphEdges_depot_d;
// a(t) -> e(d)
var graphEdges_a_depot;
// d(t) -> a(t)
var graphEdges_d_a;
// a(t) -> d(t') - compatible ones
var graphEdges_a_d;

const ID_depot_start = "s(d)";
const ID_depot_end = "e(d)";

// Routes related to the depot
const DepotRouteType = {
  // From depot to the departure station/time
  SD_TO_DT: "SD_TO_DT",
  // From arrival station/time to the depot
  AT_TO_ED: "AT_TO_ED",
  // Only for the e(d) -> s(d) edge
  IN_DEPOT: "IN_DEPOT"
};

// Route types
const RouteType = {
  // Vá.1 -> Vá.2
  V1_TO_V2: "V1_TO_V2",
  // Vá.2 -> Vá.1
  V2_TO_V1: "V2_TO_V1"
};

// The way two routes can be compatible with each other.
const CompatibilityRouteType = {
  // staying in Vá.1 until the next one starts from there
  STAYING_IN_V1: "C_STAYING_IN_V1",
  // staying in Vá.2 until the next one starts from there
  STAYING_IN_V2: "C_STAYING_IN_V2",
  // arriving in Vá.1, then going to Vá.2
  V1_TO_V2: "C_V1_TO_V2",
  // arriving in Vá.2, then going to Vá.1
  V2_TO_V1: "C_V2_TO_V1"
};

var compatibilityLimitInMins = 10;

readTextFile("data.json", function(data){
    dataSet = JSON.parse(data);
    document.getElementById("limitBox").value = compatibilityLimitInMins;
    document.getElementById("calculateBtn").onclick = calculate_btn_click;
    doBuildingProcess();
});

/**
 * Contains the phases of the generation process.
 */
function doBuildingProcess(){
  createGraphNodeIdList();
  createGraphEdgeLists();
  visualize();
  printEdgeInfo();
}

/**
 * Generates the set of nodes in the graph.
 */
function createGraphNodeIdList(){
  var arr = [];

  dataSet.v1_to_v2.forEach(t => {
    arr.push(t.departureTime);
    arr.push(t.arrivalTime);
  });
  dataSet.v2_to_v1.forEach(t => {
    arr.push(t.departureTime);
    arr.push(t.arrivalTime);
  });

  arr.push(ID_depot_start);
  arr.push(ID_depot_end);

  graphNodeIds = new Set(arr);
}

/**
 * Generates the set of edges in the graph.
 */
function createGraphEdgeLists(){
  // adding e(d) -> s(d) edge
  graphEdge_depot = {from: ID_depot_end, to: ID_depot_start};
  // adding s(d) -> d(t) edges
  graphEdges_depot_d = [];
  new Set(dataSet.v1_to_v2.map(t => t.departureTime).concat(dataSet.v2_to_v1.map(t => t.departureTime)))
  .forEach(t_departureTime => {
    graphEdges_depot_d.push({from: ID_depot_start, to: t_departureTime, routeType: DepotRouteType.SD_TO_DT});
  });
  // adding a(t) -> e(d) edges
  graphEdges_a_depot = [];
  new Set(dataSet.v1_to_v2.map(t => t.arrivalTime).concat(dataSet.v2_to_v1.map(t => t.arrivalTime)))
  .forEach(t_arrivalTime => {
    graphEdges_a_depot.push({from: t_arrivalTime, to: ID_depot_end, routeType: DepotRouteType.AT_TO_ED});
  });
  // adding d(t) -> a(t) edges
  graphEdges_d_a = [];
  dataSet.v1_to_v2.forEach(t => {
    graphEdges_d_a.push({from: t.departureTime, to: t.arrivalTime, routeType: RouteType.V1_TO_V2});
  });
  dataSet.v2_to_v1.forEach(t => {
    graphEdges_d_a.push({from: t.departureTime, to: t.arrivalTime, routeType: RouteType.V2_TO_V1});
  });
  // adding a(t) -> d(t') edges
  graphEdges_a_d = [];
  dataSet.v1_to_v2.forEach(t => {
    var comp_edges_for_t = generateCompatibilityEdges(t, RouteType.V1_TO_V2, compatibilityLimitInMins);
    comp_edges_for_t.forEach(edgeInfo => graphEdges_a_d.push(edgeInfo));
  });
  dataSet.v2_to_v1.forEach(t => {
    var comp_edges_for_t = generateCompatibilityEdges(t, RouteType.V2_TO_V1, compatibilityLimitInMins);
    comp_edges_for_t.forEach(edgeInfo => graphEdges_a_d.push(edgeInfo));
  });
}

/**
 * Returns the array of edges representing the routes which are compatible with the examined route described in parameters 'routeData' and 'routeType'.
 * @param {*} routeData Contains the departure time and the arrival time of the examined route.
 * @param {*} routeType The type of the examined route (in our case 'Vá.1 -> Vá-2' or 'Vá.2 -> Vá.1').
 * @param {*} compatibilityLimitInMins Time limit for the list of compatible routes. Only those routes will be compatible with the examined route,
 *  which start in x minutes after the arrival time belongs to the examined route (if the value of this argument is x).
 */
function generateCompatibilityEdges(routeData, routeType, compatibilityLimitInMins){
  var result = [];
  // for routes with type (Vá.1 -> Vá.2)
  if(routeType == RouteType.V1_TO_V2){
    // 1st route's arrival station (Vá.2) == 2nd route's departure station (Vá.2)
    dataSet.v2_to_v1.filter(t => (t.departureTime >= routeData.arrivalTime) && (t.departureTime <= routeData.arrivalTime + compatibilityLimitInMins))
      .map(t => { return {from: routeData.arrivalTime, to: t.departureTime, routeType: CompatibilityRouteType.STAYING_IN_V2} })
      .forEach(edgeInfo => result.push(edgeInfo));
    // 1st route's arrival station (Vá.2) != 2nd route's departure station (Vá.1)
    dataSet.v1_to_v2.filter(t => (t.departureTime >= routeData.arrivalTime + travelTimeToNextDepartureStation(routeData, routeType)) 
        && (t.departureTime <= routeData.arrivalTime + travelTimeToNextDepartureStation(routeData, routeType) + compatibilityLimitInMins))
      .map(t => { return {from: routeData.arrivalTime, to: t.departureTime, routeType: CompatibilityRouteType.V2_TO_V1} })
      .forEach(edgeInfo => result.push(edgeInfo));
  }
  // for routes with type (Vá.2 -> Vá.1)
  else if(routeType == RouteType.V2_TO_V1){
    // 1st route's arrival station (Vá.1) == 2nd route's departure station (Vá.1)
    dataSet.v1_to_v2.filter(t => (t.departureTime >= routeData.arrivalTime) && (t.departureTime <= routeData.arrivalTime + compatibilityLimitInMins))
      .map(t => { return {from: routeData.arrivalTime, to: t.departureTime, routeType: CompatibilityRouteType.STAYING_IN_V1} })
      .forEach(edgeInfo => result.push(edgeInfo));
    // 1st route's arrival station (Vá.1) != 2nd route's departure station (Vá.2)
    dataSet.v2_to_v1.filter(t => (t.departureTime >= routeData.arrivalTime + travelTimeToNextDepartureStation(routeData, routeType)) 
        && (t.departureTime <= routeData.arrivalTime + travelTimeToNextDepartureStation(routeData, routeType) + compatibilityLimitInMins))
      .map(t => { return {from: routeData.arrivalTime, to: t.departureTime, routeType: CompatibilityRouteType.V1_TO_V2} })
      .forEach(edgeInfo => result.push(edgeInfo));
  }
  // if argument routeType has an invlid value (cannot happen until the code is not edited)
  else{
    throw new Error(`'${routeType}' is not a valid RouteType value!`);
  }
  return result;
}

/**
 * Returns the necessary travel time to reach the next route's departure station (if the first route's arrival station != the second route's departure station).
 * @param {*} routeData Contains the departure time and the arrival time of the examined route.
 * @param {*} routeType The type of the examined route (in our case 'Vá.1 -> Vá-2' or 'Vá.2 -> Vá.1').
 */
function travelTimeToNextDepartureStation(routeData, routeType){
  var travelTimes = (routeType == RouteType.V1_TO_V2) ? dataSet.v2_to_v1_travelTime : dataSet.v1_to_v2_travelTime;
  // searcing for the matching time interval and returning the related travel time (or zero if no matching interval found (in case of invalid argument))
  var matchingTravelTime = travelTimes.filter(travelTimeData => (travelTimeData.from <= routeData.arrivalTime) && (routeData.arrivalTime <= travelTimeData.to))[0];
  return matchingTravelTime ? matchingTravelTime.travelTime : 0;
}

/**
 * Visualization of the graph using Cytoscape.js
 */
function visualize(){
  // elements
  var elements = [];
  // elements - nodes
  graphNodeIds.forEach(nodeId => elements.push({ data: { id: nodeId } }));
  // elements - edges
  elements.push({data: {id: `${ID_depot_end}-${ID_depot_start}`, source: ID_depot_end, target: ID_depot_start, edgeType: DepotRouteType.IN_DEPOT}});
  graphEdges_depot_d.forEach(edgeInfo => elements.push({data: {id: `${edgeInfo.routeType}-${edgeInfo.from}-${edgeInfo.to}`, source: edgeInfo.from, target: edgeInfo.to, edgeType: edgeInfo.routeType}}));
  graphEdges_a_depot.forEach(edgeInfo => elements.push({data: {id: `${edgeInfo.routeType}-${edgeInfo.from}-${edgeInfo.to}`, source: edgeInfo.from, target: edgeInfo.to, edgeType: edgeInfo.routeType}}));
  graphEdges_a_d.forEach(edgeInfo => elements.push({data: {id: `${edgeInfo.routeType}-${edgeInfo.from}-${edgeInfo.to}`, source: edgeInfo.from, target: edgeInfo.to, edgeType: edgeInfo.routeType}}));
  graphEdges_d_a.forEach(edgeInfo => elements.push({data: {id: `${edgeInfo.routeType}-${edgeInfo.from}-${edgeInfo.to}`, source: edgeInfo.from, target: edgeInfo.to, edgeType: edgeInfo.routeType}}));

  // styles
  var style = [
    {
      // depot (s(d) and (e(d)) node style
      selector: `node[id != "${ID_depot_start}"], node[id != "${ID_depot_end}"]`,
      style: {
        'background-color': '#ffdd44',
        'label': 'data(id)'
      }
    },
    {
      // d(t), a(t) nodes style
      selector: `node[id = "${ID_depot_start}"], node[id = "${ID_depot_end}"]`,
      style: {
        'background-color': '#000000',
        'label': 'data(id)'
      }
    },
    {
      // inside-depot (e(d) -> s(d)) edge style
      selector: `edge[edgeType = "${DepotRouteType.IN_DEPOT}"]`,
      style: {
        'width': 1,
        'line-color': '#00ffff',
        'line-style': 'solid',
        'target-arrow-color': '#00ffff',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier'
      }
    },
    {
      // from-depot (s(d) -> d(t)) edge style
      selector: `edge[edgeType = "${DepotRouteType.SD_TO_DT}"]`,
      style: {
        'width': 1,
        'line-color': '#000000',
        'line-style': 'solid',
        'target-arrow-color': '#000000',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier'
      }
    },
    {
      // to-depot (a(t) -> e(d)) edge style
      selector: `edge[edgeType = "${DepotRouteType.AT_TO_ED}"]`,
      style: {
        'width': 1,
        'line-color': '#bbbbbb',
        'line-style': 'solid',
        'target-arrow-color': '#bbbbbb',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier'
      }
    },
    {
      // v1_to_v2 (d(t) -> a(t)) edge style
      selector: `edge[edgeType = "${RouteType.V1_TO_V2}"]`,
      style: {
        'width': 1,
        'line-color': '#ff0000',
        'line-style': 'solid',
        'target-arrow-color': '#ff0000',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier'
      }
    },
    {
      // v2_to_v1 (d(t) -> a(t)) edge style
      selector: `edge[edgeType = "${RouteType.V2_TO_V1}"]`,
      style: {
        'width': 1,
        'line-color': '#0000ff',
        'line-style': 'solid',
        'target-arrow-color': '#0000ff',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier'
      }
    },
    {
      // compatibility.v1_to_v2 (a(t) -> d(t')) edge style
      selector: `edge[edgeType = "${CompatibilityRouteType.V1_TO_V2}"]`,
      style: {
        'width': 1,
        'line-color': '#f5812f',
        'line-style': 'solid',
        'target-arrow-color': '#f5812f',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier'
      }
    },
    {
      // compatibility.v2_to_v1 (a(t) -> d(t')) edge style
      selector: `edge[edgeType = "${CompatibilityRouteType.V2_TO_V1}"]`,
      style: {
        'width': 1,
        'line-color': '#2ff55d',
        'line-style': 'solid',
        'target-arrow-color': '#2ff55d',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier'
      }
    },
    {
      // compatibility.staying_in_v1 (a(t) -> d(t')) edge style
      selector: `edge[edgeType = "${CompatibilityRouteType.STAYING_IN_V1}"]`,
      style: {
        'width': 1,
        'line-color': '#2ff55d',
        'line-style': 'dotted',
        'target-arrow-color': '#2ff55d',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier'
      }
    },
    {
      // compatibility.staying_in_v2 (a(t) -> d(t')) edge style
      selector: `edge[edgeType = "${CompatibilityRouteType.STAYING_IN_V2}"]`,
      style: {
        'width': 1,
        'line-color': '#f5812f',
        'line-style': 'dotted',
        'target-arrow-color': '#f5812f',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier'
      }
    }
  ];

  // layout
  var layout = {
    name: "concentric",
    levelWidth: function(nodes){
      return 1;
    }
  }

  // container
  var container = document.getElementById("vspGraph");

  // graph
  vsp_graph = cytoscape({
    container: container,
    elements: elements,
    style: style,
    layout: layout
  });
}

/**
 * Prints information about the number of displayed edges to the console.
 */
function printEdgeInfo(){
    console.log("Number of calculated edges:");
    console.log("s(d) -> d(t) edges:" + graphEdges_depot_d.length);
    console.log("a(t) -> e(d) edges:" + graphEdges_a_depot.length);
    console.log("d(t) -> a(t) edges:" + graphEdges_d_a.length);
    console.log("a(t) -> d(t') edges:" + graphEdges_a_d.length);
}

/**
 * Event handler for the 'Calculate' button to rebuild the VSP graph for a different time limit to the departure time of the compatible routes'.
 */
function calculate_btn_click(){
  compatibilityLimitInMins = Number(document.getElementById("limitBox").value);
  doBuildingProcess();
}

/**
 * Reads the file contains the necessary data for the VSP visualization.
 * @param {*} file Name of the data file.
 * @param {*} callback Action to perform after the file has been read.
 */
function readTextFile(file, callback) {
    var rawFile = new XMLHttpRequest();
    rawFile.overrideMimeType("application/json");
    rawFile.open("GET", file, true);
    rawFile.onreadystatechange = function() {
      if (rawFile.readyState === 4 && rawFile.status == "200") {
        callback(rawFile.responseText);
      }
    };
    rawFile.send(null);
}