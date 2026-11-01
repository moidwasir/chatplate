import type { Metadata } from 'next';
import { CONTACT_EMAIL, LegalPage } from '../legal';

export const metadata: Metadata = { title: 'Privacy Policy — ChatPlate' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="1 November 2026">
      <p>
        ChatPlate lets restaurants take food orders over WhatsApp. This policy explains what we collect when you
        order through a restaurant that uses ChatPlate, why, and the choices you have.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your WhatsApp phone number and the profile name WhatsApp shares with businesses.</li>
        <li>The messages you send to the restaurant&apos;s WhatsApp number and the replies we send.</li>
        <li>Your orders: items, options, notes, totals, tips and payment method.</li>
        <li>For delivery orders, the location you share and the delivery addresses you save.</li>
        <li>For restaurant staff using the dashboard: name, email and sign-in activity.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To take, prepare and deliver your order and send you order updates on WhatsApp.</li>
        <li>To remember your cart and saved addresses so ordering again is quicker.</li>
        <li>To check that your address is inside the delivery area and calculate the delivery fee.</li>
        <li>To keep the service secure and fix problems.</li>
      </ul>
      <p>We do not sell your data and we do not use it for advertising.</p>

      <h2>Who we share it with</h2>
      <ul>
        <li>The restaurant you order from, which needs it to fulfil your order.</li>
        <li>Meta (WhatsApp), which carries the messages under its own terms and privacy policy.</li>
        <li>
          Service providers that host ChatPlate for us (Vercel, Neon and Upstash), only to run the service.
        </li>
        <li>Authorities, if the law requires it.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Chat sessions and carts expire after 24 hours of inactivity. Orders and messages are kept as long as the
        restaurant needs them for its records, or until you ask us to delete them.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Stop messaging the restaurant at any time; we only reply to messages you send.</li>
        <li>
          Ask for a copy of your data, or for it to be deleted, as described on our{' '}
          <a href="/data-deletion">data deletion page</a>.
        </li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </LegalPage>
  );
}
