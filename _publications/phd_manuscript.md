---
title: "Autonomous Exploration of an Unknown 3D Environment"
collection: publications
category: other
# # permalink: /publications/2009-10-01-paper-title-number-1
excerpt: 
date: 2025-01-24
venue: 'HAL open-science archive (2025)'
# # slidesurl: 'http://academicpages.github.io/files/slides1.pdf'
# # paperurl: 'http://academicpages.github.io/files/paper1.pdf'
citation: 'T. Noël, "Autonomous exploration of an unknown 3D environment". Robotics [cs.RO]. Université de Rennes, 2025. English. ⟨NNT : 2025URENS005⟩. ⟨tel-05127636⟩'
tags:
    - "path-planning"
    - "exploration"
---

**Abstract**: This manuscript investigates the problem of robotic autonomous exploration in 3D environments. It is a transversal research question involving various robotics tasks such as mapping, motion planning, and control. From a high-level standpoint, exploration can be seen as the maximization of the information gain about the environment, often combined with a minimization of energy expenditure. Considering the standard action-perception loop, exploration presents a strong coupling between past sensor observations and future actions, as the progressive discovery of the environment dynamically dictates the future optimal sensor path. This coupling is even more pronounced for directional sensors, e.g. cameras, for which the robot state drastically impacts the sensors observations. Deriving high-quality plans from the current environment state is thus essential, but remains challenging due to the high uncertainties in the workspace.

In this work, we focus on those planning aspects, developing various combinations of environment representations and planning strategies to improve the exploration performance of the robot. More precisely, we relied on standard mapping algorithms to provide a geometrical representation of the environment. The core of our work consisted in exploiting this map to derive efficient navigation roadmaps and exploration strategies, taking into account the safety requirements imposed by the environment while ensuring high-quality observations even for directional sensors. Our methods are evaluated extensively in realistic simulation environments and deployed on a ground mobile robot with various range sensors in multiple real-world experiments.

**PDF**: [HAL](https://theses.hal.science/tel-05127636/)

**Defense Recording**: 
<iframe width="640" height="390" src="https://www.youtube.com/watch?v=nihoO_knoOc" frameborder="0" allowfullscreen></iframe>