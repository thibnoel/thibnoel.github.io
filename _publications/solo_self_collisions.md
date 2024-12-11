---
title: A Hybrid Collision Model for Safety Collision Control
collection: publications
category: conferences
# permalink: /publications/2009-10-01-paper-title-number-1
excerpt: 'This paper describes the combination of geometric primitives and data-driven approaches to safely avoid the self-collisions on a quadruped.'
date: 2021-05-30
venue: 'IEEE International Conference on Robotics and Automation (ICRA)'
# slidesurl: 'http://academicpages.github.io/files/slides1.pdf'
# paperurl: 'http://academicpages.github.io/files/paper1.pdf'
citation: "T. Noël, T. Flayols, J. Mirabel, J. Carpentier and N. Mansard, \"A Hybrid Collision Model for Safety Collision Control,\" 2021 IEEE International Conference on Robotics and Automation (ICRA), Xi'an, China, 2021, pp. 1722-1728, doi: 10.1109/ICRA48506.2021.9561730."
tags: 
    - "legged robotics"
    - "collision avoidance"
    - "data-driven"
---

**Abstract**:
Self-collision detection and avoidance are essential for reactive control, in particular for dynamics robots equipped with legs or arms. Yet, only few control methods are able to handle such constraints, and it is often necessary to rely on path planning to define a collision-free trajectory that the controller would then track. In this paper, we introduce a combination of two lightweight, conservative and smooth models to generically handle self-collisions in robot control. For pairs of bodies that are far from one another on average (e.g. segments of distinct legs), we rely on a standard forward kinematics approach, using simplified geometries for which we provide analytical derivatives. For bodies that are moving close to one another, we propose to use a data-driven approach, with datasets generated thanks to a standard collision library. We then build a simple torque-based controller that can be implemented on top of any control law to prevent unexpected self-collision. This controller is meant to be implemented as a low-level protection, directly on the robot hardware. We also provide an open-source library to generate ANSI-C code for any robot model, experimented on the real quadruped Solo.

**PDF**: [IEEE](https://ieeexplore.ieee.org/document/9561730) \| [HAL](https://laas.hal.science/hal-03000951v1/document)

**Companion Video**:
<iframe title="A hybrid collision model for safety collision control - Solo quadruped experiments" width="640" height="390" src="https://peertube.laas.fr/videos/embed/b6e911ee-728f-4337-a76e-8138a332b583" frameborder="0" allowfullscreen="" sandbox="allow-same-origin allow-scripts allow-popups allow-forms"></iframe>


