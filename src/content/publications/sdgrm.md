---
title: "Skeleton Disk-Graph Roadmap: A Sparse Deterministic Roadmap For Safe 2D Navigation and Exploration"
category: journals
excerpt: 'Relying on the skeleton of the Signed-Distance Field (SDF) of the environment, we propose a deterministic roadmap construction method suitable for navigation and exploration.'
date: 2024-01-01
venue: 'IEEE Robotics and Automation Letters (RA-L)'
citation: 'T. Noël, A. Lehuger, E. Marchand and F. Chaumette, "Skeleton Disk-Graph Roadmap: A Sparse Deterministic Roadmap for Safe 2D Navigation and Exploration," in IEEE Robotics and Automation Letters, vol. 9, no. 1, pp. 555-562, Jan. 2024, doi: 10.1109/LRA.2023.3334103.'
doi: '10.1109/LRA.2023.3334103'
bibtex: |
  @article{noel2024sdgrm,
    author  = {No{\"e}l, Thibault and Lehuger, Antoine and Marchand, Eric and Chaumette, Fran{\c{c}}ois},
    title   = {Skeleton Disk-Graph Roadmap: A Sparse Deterministic Roadmap for Safe 2D Navigation and Exploration},
    journal = {IEEE Robotics and Automation Letters},
    volume  = {9},
    number  = {1},
    pages   = {555--562},
    year    = {2024},
    doi     = {10.1109/LRA.2023.3334103}
  }
video:
  title: Skeleton Disk-Graph Roadmap (RA-L 2024)
  youtube: T-aOIx6_-ts
tags:
    - "path-planning"
    - "exploration"
---

**Abstract**: In this letter, we describe a novel roadmap construction method in unknown environments, which relies on the extraction of the Hamilton-Jacobi skeleton of the free space. This skeleton is used to construct a graph of free-space bubbles, effectively compressing the skeleton information in a sparse data structure but retaining its topology. The bubbles also enforce safety directly in the roadmap structure. We first demonstrate the relevance of this approach for standard path-planning tasks. We also propose a frontiers-based exploration strategy able to autonomously and safely build a complete 2D map of the environment.

**PDF**: [IEEE](https://ieeexplore.ieee.org/abstract/document/10321671) \| [HAL](https://hal.science/hal-04282634/file/2023_ral_noel.pdf)
