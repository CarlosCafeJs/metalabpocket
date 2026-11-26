import { redirect } from 'next/navigation';

// Keep old bookmarks and links working while the product uses personal profiles.
export default function LegacyBusinessPage(){redirect('/meu-perfil');}
