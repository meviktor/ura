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
const DepotRouteType = {
  SD_TO_DT: "SD_TO_DT",
  AT_TO_ED: "AT_TO_ED",
  IN_DEPOT: "IN_DEPOT"
};
const RouteType = {
  V1_TO_V2: "V1_TO_V2",
  V2_TO_V1: "V2_TO_V1"
};
const CompatibilityRouteType = {
  STAYING_IN_V1: "C_STAYING_IN_V1",
  STAYING_IN_V2: "C_STAYING_IN_V2",
  V1_TO_V2: "C_V1_TO_V2",
  V2_TO_V1: "C_V2_TO_V1"
};

var compatibilityLimitInMins = 10;

readTextFile("data.json", function(data){
    dataSet = JSON.parse(data);
    document.getElementById("limitBox").value = compatibilityLimitInMins;
    document.getElementById("calculateBtn").onclick = calculate_btn_click;
    doBuildingProcess();
});

function doBuildingProcess(){
  createGraphNodeIdList();
  createGraphEdgeLists();
  visualize();
  printEdgeInfo();
}

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

function generateCompatibilityEdges(routeData, routeType, compatibilityLimitInMins){
  var result = [];
  if(routeType == RouteType.V1_TO_V2){
    dataSet.v2_to_v1.filter(t => (t.departureTime >= routeData.arrivalTime) && (t.departureTime <= routeData.arrivalTime + compatibilityLimitInMins))
      .map(t => { return {from: routeData.arrivalTime, to: t.departureTime, routeType: CompatibilityRouteType.STAYING_IN_V2} })
      .forEach(edgeInfo => result.push(edgeInfo));

    dataSet.v1_to_v2.filter(t => (t.departureTime >= routeData.arrivalTime + travelTimeToNextDepartureStation(routeData, routeType)) 
        && (t.departureTime <= routeData.arrivalTime + travelTimeToNextDepartureStation(routeData, routeType) + compatibilityLimitInMins))
      .map(t => { return {from: routeData.arrivalTime, to: t.departureTime, routeType: CompatibilityRouteType.V2_TO_V1} })
      .forEach(edgeInfo => result.push(edgeInfo));
  }
  else if(routeType == RouteType.V2_TO_V1){
    dataSet.v1_to_v2.filter(t => (t.departureTime >= routeData.arrivalTime) && (t.departureTime <= routeData.arrivalTime + compatibilityLimitInMins))
      .map(t => { return {from: routeData.arrivalTime, to: t.departureTime, routeType: CompatibilityRouteType.STAYING_IN_V1} })
      .forEach(edgeInfo => result.push(edgeInfo));
    
    dataSet.v2_to_v1.filter(t => (t.departureTime >= routeData.arrivalTime + travelTimeToNextDepartureStation(routeData, routeType)) 
        && (t.departureTime <= routeData.arrivalTime + travelTimeToNextDepartureStation(routeData, routeType) + compatibilityLimitInMins))
      .map(t => { return {from: routeData.arrivalTime, to: t.departureTime, routeType: CompatibilityRouteType.V1_TO_V2} })
      .forEach(edgeInfo => result.push(edgeInfo));
  }
  else{
    throw new Error(`'${routeType}' is not a valid RouteType value!`);
  }
  return result;
}

function travelTimeToNextDepartureStation(routeData, routeType){
  var travelTimes = (routeType == RouteType.V1_TO_V2) ? dataSet.v2_to_v1_travelTime : dataSet.v1_to_v2_travelTime;
  // searcing for the matching time interval and returning the related travel time (or zero if no matching interval found (in case of invalid argument))
  var matchingTravelTime = travelTimes.filter(travelTimeData => (travelTimeData.from <= routeData.arrivalTime) && (routeData.arrivalTime <= travelTimeData.to))[0];
  return matchingTravelTime ? matchingTravelTime.travelTime : 0;
}

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

function printEdgeInfo(){
    console.log("Number of calculated edges:");
    console.log("s(d) -> d(t) edges:" + graphEdges_depot_d.length);
    console.log("a(t) -> e(d) edges:" + graphEdges_a_depot.length);
    console.log("d(t) -> a(t) edges:" + graphEdges_d_a.length);
    console.log("a(t) -> d(t') edges:" + graphEdges_a_d.length);
}

function calculate_btn_click(){
  compatibilityLimitInMins = Number(document.getElementById("limitBox").value);
  doBuildingProcess();
}

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