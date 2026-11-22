---
title: "Disk-Graph Probabilistic Roadmap: Biased Distance Sampling for Path Planning in a Partially Unknown Environment"
category: conferences
excerpt: 'To improve safety and sparsity of navigation roadmaps, we propose a sampling-driven approach treating the roadmap nodes as free-space bubbles.'
date: 2022-10-23
venue: 'IEEE/RSJ International Conference on Intelligent Robots and Systems (IROS)'
citation: 'T. Noël, S. Kabbour, A. Lehuger, E. Marchand and F. Chaumette, "Disk-Graph Probabilistic Roadmap: Biased Distance Sampling for Path Planning in a Partially Unknown Environment", 2022 IEEE/RSJ International Conference on Intelligent Robots and Systems (IROS), Kyoto, Japan, 2022, pp. 5707-5714, doi: 10.1109/IROS47612.2022.9981136.'
doi: '10.1109/IROS47612.2022.9981136'
bibtex: |
  @inproceedings{noel2022dgprm,
    author    = {No{\"e}l, Thibault and Kabbour, S. and Lehuger, Antoine and Marchand, Eric and Chaumette, Fran{\c{c}}ois},
    title     = {Disk-Graph Probabilistic Roadmap: Biased Distance Sampling for Path Planning in a Partially Unknown Environment},
    booktitle = {2022 IEEE/RSJ International Conference on Intelligent Robots and Systems (IROS)},
    address   = {Kyoto, Japan},
    pages     = {5707--5714},
    year      = {2022},
    doi       = {10.1109/IROS47612.2022.9981136}
  }
video:
  title: Disk-Graph Probabilistic Roadmap (IROS 2022)
  youtube: uQPAflqvXxo
tags:
    - "path-planning"
    - "exploration"
---

**Abstract**: In this paper, we propose a new sampling-based path planning approach, focusing on the challenges linked to autonomous exploration. Our method relies on the definition of a disk graph of free-space bubbles, from which we derive a biased sampling function that expands the graph towards known free space for maximal navigability and frontiers discovery. The proposed method demonstrates an exploratory behavior similar to Rapidly-exploring Random Trees, while retaining the connectivity and flexibility of a graph-based planner. We demonstrate the interest of our method by first comparing its path planning capabilities against state-of-the-art approaches, before discussing exploration-specific aspects, namely replanning capabilities and incremental construction of the graph. A simple frontiers-driven exploration controller derived from our planning method is also demonstrated using the Pioneer platform.

**PDF**: [IEEE](https://ieeexplore.ieee.org/document/9981136) \| [HAL](https://inria.hal.science/hal-03752195/file/2022_iros_noel.pdf)
