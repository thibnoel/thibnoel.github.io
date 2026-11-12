export const SITE = {
  title: 'Thibault Noël',
  tagline: 'Autonomous mobile robotics',
  description:
    'Thibault Noël, robotics R&D engineer with a PhD in autonomous navigation: planning and exploration, simulation, ROS 2 architecture, CAD and integration.',
  author: {
    name: 'Thibault Noël',
    bio: 'Robotics R&D engineer, PhD',
    avatar: '/images/mini_profile.png',
    location: 'Rennes, France',
    email: 'thibault.noel@inria.fr',
  },
  links: [
    { label: 'Google Scholar', href: 'https://scholar.google.com/citations?user=CNLQsG0AAAAJ&hl=fr' },
    { label: 'ORCID', href: 'https://orcid.org/0009-0000-6418-2104' },
    { label: 'GitHub', href: 'https://github.com/thibnoel' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/thibault-no%C3%ABl-bb045a154' },
  ],
} as const;

export const PUBLICATION_CATEGORIES = {
  manuscripts: 'Journal Papers',
  conferences: 'Conference Papers',
  books: 'Books',
  other: 'Other',
} as const;
