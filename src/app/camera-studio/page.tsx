import { redirect } from 'next/navigation';

/** The camera is now launched only from the virtual phone. */
export default function LegacyCameraRoute() {
  redirect('/celular');
}
