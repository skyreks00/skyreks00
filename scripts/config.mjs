// Contenu du profil : c'est ce fichier qu'il faut modifier pour changer les textes.

export const login = 'skyreks00';

export const banner = {
  name: 'skyreks',
  phrases: [
    'développeur web full-stack',
    'React · Node.js · Socket.io · WebRTC',
    'en ce moment : permisfree.be',
  ],
};

// Clés de scripts/icons.json, regroupées par catégorie.
export const stack = [
  { label: 'Front-end', icons: ['javascript', 'react', 'vite', 'tailwindcss', 'html5', 'css3', 'threedotjs'] },
  { label: 'Back-end', icons: ['nodedotjs', 'express', 'socketdotio', 'webrtc'] },
  { label: 'Données', icons: ['mysql', 'mongodb', 'prisma', 'supabase', 'firebase'] },
  { label: 'Outils', icons: ['git', 'githubactions'] },
];

export const iconLabels = { html5: 'HTML', css3: 'CSS' };

// Projets mis en avant. Étoiles, forks et langage sont relus sur GitHub à chaque mise à jour.
export const projects = [
  {
    repo: 'permis-online-free',
    title: 'Permis Online Free',
    description: 'Plateforme gratuite pour réviser le permis théorique belge : leçons, quiz par thème et examen blanc.',
    tags: ['React', 'Vite', 'Firebase', 'PWA'],
    // GitHub classe ce dépôt en HTML à cause des leçons ; le code de l'application est en JavaScript.
    language: 'JavaScript',
    link: { label: 'permisfree.be', url: 'https://www.permisfree.be' },
  },
  {
    repo: 'ch4to.org',
    title: 'Ch4to',
    description: 'Messagerie en temps réel avec groupes, partage de fichiers et appels vidéo en pair à pair. Projet de fin d’études.',
    tags: ['Node.js', 'Socket.io', 'WebRTC', 'MySQL', 'MongoDB'],
  },
];

// Langages ignorés dans la carte « Langages ».
export const excludedLanguages = ['Batchfile'];
