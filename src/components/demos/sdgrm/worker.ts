/// <reference lib="webworker" />
import { runPipeline, type MapParams, type RoadmapParams } from './core';

export interface ComputeRequest {
  id: number;
  width: number;
  height: number;
  occupancy: Uint8Array;
  mapParams: MapParams;
  roadmapParams: RoadmapParams;
}

export interface ComputeResponse {
  id: number;
  obstacles: Uint8Array;
  dist: Float64Array;
  skeleton: Uint8Array;
  /** Flattened [x, y, r] triplets, in meters. */
  bubbles: Float64Array;
  /** Flattened [a, b] node index pairs. */
  edges: Uint32Array;
  timings: { distance: number; skeleton: number; roadmap: number };
}

self.onmessage = (event: MessageEvent<ComputeRequest>) => {
  const { id, width, height, occupancy, mapParams, roadmapParams } = event.data;
  const result = runPipeline(occupancy, width, height, mapParams, roadmapParams);
  const { bubbles: bubbleList, edges: edgeList } = result.roadmap;
  const bubbles = new Float64Array(bubbleList.length * 3);
  bubbleList.forEach((b, i) => bubbles.set([b.x, b.y, b.r], i * 3));
  const edges = new Uint32Array(edgeList.flat());
  const response: ComputeResponse = {
    id,
    obstacles: result.obstacles,
    dist: result.field.dist,
    skeleton: result.skeleton,
    bubbles,
    edges,
    timings: result.timings,
  };
  self.postMessage(response, [
    response.obstacles.buffer,
    response.dist.buffer,
    response.skeleton.buffer,
    bubbles.buffer,
    edges.buffer,
  ]);
};
