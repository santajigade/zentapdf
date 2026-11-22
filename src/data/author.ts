// Site author shown on guides and templates (byline, author box, author page, schema).
import { abs } from '../lib/schema';
export const AUTHOR = {
  name: 'Santaji Gadepatil',
  slug: 'santaji-gadepatil',
  url: '/author/santaji-gadepatil/',
  photo: '/authors/santaji-gadepatil.webp',
  photoJpg: '/authors/santaji-gadepatil.jpg',
  linkedin: 'https://www.linkedin.com/in/santaji-gadepatil6680/',
  jobTitle: 'Founder, ZentaPDF',
  bio: 'Santaji is the founder of ZentaPDF, an engineer (B.E. Electronics and Telecommunication) from Pune, India, who builds free browser tools for PDFs, images and audio.',
};
export const authorSchema = () => ({
  '@type': 'Person', name: AUTHOR.name, url: abs(AUTHOR.url), image: abs(AUTHOR.photoJpg), jobTitle: AUTHOR.jobTitle, sameAs: [AUTHOR.linkedin],
});
