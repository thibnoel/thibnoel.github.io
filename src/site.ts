export const SITE = {
  title: 'Thibault Noël',
  tagline: 'Robotics: motion planning and autonomous exploration',
  description:
    'Thibault Noël, PhD in robotics: motion planning, roadmaps and autonomous exploration of unknown environments.',
  author: {
    name: 'Thibault Noël',
    bio: 'PhD in robotics',
    avatar: '/images/mini_profile.png',
    location: 'Rennes',
    employer: 'Inria',
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
