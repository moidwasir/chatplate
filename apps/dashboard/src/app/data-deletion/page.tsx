import type { Metadata } from 'next';
import { CONTACT_EMAIL, LegalPage } from '../legal';

export const metadata: Metadata = { title: 'Data Deletion — ChatPlate' };

export default function DataDeletionPage() {
  return (
    <LegalPage title="Delete your data" updated="1 November 2026">
      <p>You can ask us to delete the data ChatPlate holds about you at any time.</p>

      <h2>How to ask</h2>
      <ul>
        <li>
          Email <a href={`mailto:${CONTACT_EMAIL}?subject=ChatPlate%20data%20deletion`}>{CONTACT_EMAIL}</a> with
          the subject &ldquo;ChatPlate data deletion&rdquo;.
        </li>
        <li>Include the WhatsApp number you ordered from, so we can find your records.</li>
      </ul>

      <h2>What happens next</h2>
      <ul>
        <li>We confirm the request with a WhatsApp message to that number.</li>
        <li>
          Within 30 days we delete your profile, saved addresses, chat messages and session data. Orders are
          anonymised (your name and number removed) where the restaurant must keep them for tax or accounting.
        </li>
        <li>We email you when it&apos;s done.</li>
      </ul>

      <p>
        Messages also pass through WhatsApp. To manage the data Meta holds, use the privacy settings in WhatsApp.
      </p>
    </LegalPage>
  );
}
