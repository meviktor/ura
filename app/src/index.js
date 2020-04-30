import cytoscape from "cytoscape";

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

const ID_depot_start = 0;
const ID_depot_end = Number.MAX_SAFE_INTEGER;
const RouteType = {
  V1_TO_V2: 0,
  V2_TO_V1: 1
};
const CompatibilityRouteType = {
  STAYING_IN_V1: 0,
  STAYING_IN_V2: 1,
  V1_TO_V2: 2,
  V2_TO_V1: 3
};

readTextFile("data.json", function(data){
    dataSet = JSON.parse(data);
    createGraphNodeIdList();
    createGraphEdgeLists();
});

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
  dataSet.v1_to_v2.forEach(t => {
    graphEdges_depot_d.push({from: ID_depot_start, to: t.departureTime});
  });
  dataSet.v2_to_v1.forEach(t => {
    graphEdges_depot_d.push({from: ID_depot_start, to: t.departureTime});
  });
  // adding a(t) -> e(d) edges
  graphEdges_a_depot = [];
  dataSet.v1_to_v2.forEach(t => {
    graphEdges_a_depot.push({from: t.arrivalTime, to: ID_depot_end});
  });
  dataSet.v2_to_v1.forEach(t => {
    graphEdges_a_depot.push({from: t.arrivalTime, to: ID_depot_end});
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
    var comp_edges_for_t = generateCompatibilityEdges(t, RouteType.V1_TO_V2);
    comp_edges_for_t.forEach(edgeInfo => graphEdges_a_d.push(edgeInfo));
  });
  dataSet.v2_to_v1.forEach(t => {
    var comp_edges_for_t = generateCompatibilityEdges(t, RouteType.V2_TO_V1);
    comp_edges_for_t.forEach(edgeInfo => graphEdges_a_d.push(edgeInfo));
  });
}

function generateCompatibilityEdges(routeData, routeType){
  var result = [];
  if(routeType == RouteType.V1_TO_V2){
    result.push(
      dataSet.v2_to_v1.filter(t => t.departureTime >= routeData.arrivalTime)
      .map(t => {
        return {from: routeData.arrivalTime, to: t.departureTime, compatibilityRouteType: CompatibilityRouteType.STAYING_IN_V2};
      }
    ));
    result.push(
      dataSet.v1_to_v2.filter(t => t.departureTime >= routeData.arrivalTime + travelTimeToNextDepartureStation(routeData, routeType))
      .map(t => {
        return {from: routeData.arrivalTime, to: t.departureTime, compatibilityRouteType: CompatibilityRouteType.V2_TO_V1};
      }
    ));
  }
  else if(routeType == RouteType.V2_TO_V1){
    result.push(
      dataSet.v1_to_v2.filter(t => t.departureTime >= routeData.arrivalTime)
      .map(t => {
        return {from: routeData.arrivalTime, to: t.departureTime, compatibilityRouteType: CompatibilityRouteType.STAYING_IN_V1};
      }
    ));
    result.push(
      dataSet.v2_to_v1.filter(t => t.departureTime >= routeData.arrivalTime + travelTimeToNextDepartureStation(routeData, routeType))
      .map(t => {
        return {from: routeData.arrivalTime, to: t.departureTime, compatibilityRouteType: CompatibilityRouteType.V1_TO_V2};
      }
    ));
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