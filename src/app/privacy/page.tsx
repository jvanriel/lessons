import { getLocale } from "@/lib/locale";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Privacy Policy — Golf Lessons" };

const content: Record<Locale, { title: string; lastUpdated: string; sections: Array<{ heading: string; body: string }> }> = {
  en: {
    title: "Privacy Policy",
    lastUpdated: "Last updated: April 2026",
    sections: [
      {
        heading: "1. Who we are",
        body: "Golf Lessons (golflessons.be) is a platform that connects golf students with golf professionals for lesson bookings, coaching, and communication. The platform is operated from Belgium.",
      },
      {
        heading: "2. What data we collect",
        body: "We collect the following personal data:\n\n- **Account information**: name, email address, phone number, preferred language.\n- **Golf profile**: handicap, improvement goals.\n- **Booking data**: lesson dates, times, locations, scheduling preferences.\n- **Payment data**: payment method details are processed and stored by Stripe. We do not store card numbers on our servers.\n- **Communication data**: messages exchanged between students and pros via the coaching chat.\n- **Technical data**: IP address, browser type, and device information for security and analytics purposes.",
      },
      {
        heading: "3. Why we collect your data",
        body: "We process your personal data for the following purposes:\n\n- To create and manage your account.\n- To enable lesson bookings between students and pros.\n- To process payments via Stripe.\n- To facilitate coaching communication.\n- To send transactional emails (booking confirmations, reminders, verification).\n- To improve our platform and services.",
      },
      {
        heading: "4. Legal basis",
        body: "We process your data based on:\n\n- **Contract performance**: to provide the services you signed up for.\n- **Legitimate interest**: to improve our platform and prevent fraud.\n- **Consent**: for optional marketing communications (you can opt out anytime via your profile).",
      },
      {
        heading: "5. Who has access to your data",
        body: "- **Golf professionals** you connect with can see your name, contact details, booking history, and coaching messages.\n- **Stripe** processes your payment data under their own privacy policy.\n- **Google Workspace** is used for email delivery.\n- We do not sell your data to third parties.",
      },
      {
        heading: "6. Data retention",
        body: "We retain your data for as long as your account is active. When you request account deletion, your personal data is soft-deleted and your future bookings are cancelled. Booking history may be retained for accounting and legal purposes for up to 7 years.",
      },
      {
        heading: "7. Your rights",
        body: "Under the GDPR, you have the right to:\n\n- Access your personal data.\n- Rectify inaccurate data.\n- Request deletion of your data.\n- Restrict or object to processing.\n- Data portability.\n- Withdraw consent at any time.\n\nTo exercise these rights, contact us at privacy@golflessons.be.",
      },
      {
        heading: "8. Cookies",
        body: "We use essential cookies for authentication and session management. We do not use advertising or tracking cookies.",
      },
      {
        heading: "9. Security",
        body: "We use industry-standard security measures including HTTPS encryption, secure password hashing, and access controls to protect your data.",
      },
      {
        heading: "10. Contact",
        body: "For privacy-related questions, contact us at privacy@golflessons.be.",
      },
    ],
  },
  nl: {
    title: "Privacybeleid",
    lastUpdated: "Laatst bijgewerkt: april 2026",
    sections: [
      {
        heading: "1. Wie zijn wij",
        body: "Golf Lessons (golflessons.be) is een platform dat golfstudenten verbindt met golfprofessionals voor het boeken van lessen, coaching en communicatie. Het platform wordt beheerd vanuit Belgi\u00eb.",
      },
      {
        heading: "2. Welke gegevens verzamelen wij",
        body: "Wij verzamelen de volgende persoonsgegevens:\n\n- **Accountgegevens**: naam, e-mailadres, telefoonnummer, voorkeurstaal.\n- **Golfprofiel**: handicap, verbeterdoelen.\n- **Boekingsgegevens**: lesdatums, tijden, locaties, planningsvoorkeuren.\n- **Betalingsgegevens**: betaalmethode-informatie wordt verwerkt en opgeslagen door Stripe. Wij slaan geen kaartnummers op onze servers op.\n- **Communicatiegegevens**: berichten uitgewisseld tussen studenten en pro's via de coaching-chat.\n- **Technische gegevens**: IP-adres, browsertype en apparaatinformatie voor beveiligings- en analysedoeleinden.",
      },
      {
        heading: "3. Waarom verzamelen wij uw gegevens",
        body: "Wij verwerken uw persoonsgegevens voor de volgende doeleinden:\n\n- Om uw account aan te maken en te beheren.\n- Om het boeken van lessen tussen studenten en pro's mogelijk te maken.\n- Om betalingen via Stripe te verwerken.\n- Om coaching-communicatie te faciliteren.\n- Om transactionele e-mails te versturen (boekingsbevestigingen, herinneringen, verificatie).\n- Om ons platform en onze diensten te verbeteren.",
      },
      {
        heading: "4. Rechtsgrond",
        body: "Wij verwerken uw gegevens op basis van:\n\n- **Uitvoering van een overeenkomst**: om de diensten te leveren waarvoor u zich heeft aangemeld.\n- **Gerechtvaardigd belang**: om ons platform te verbeteren en fraude te voorkomen.\n- **Toestemming**: voor optionele marketingcommunicatie (u kunt zich op elk moment afmelden via uw profiel).",
      },
      {
        heading: "5. Wie heeft toegang tot uw gegevens",
        body: "- **Golfprofessionals** waarmee u verbonden bent, kunnen uw naam, contactgegevens, boekingsgeschiedenis en coachingberichten zien.\n- **Stripe** verwerkt uw betalingsgegevens onder hun eigen privacybeleid.\n- **Google Workspace** wordt gebruikt voor e-mailbezorging.\n- Wij verkopen uw gegevens niet aan derden.",
      },
      {
        heading: "6. Bewaartermijn",
        body: "Wij bewaren uw gegevens zolang uw account actief is. Wanneer u verzoekt om accountverwijdering, worden uw persoonsgegevens soft-deleted en worden uw toekomstige boekingen geannuleerd. Boekingsgeschiedenis kan worden bewaard voor boekhoudkundige en juridische doeleinden tot 7 jaar.",
      },
      {
        heading: "7. Uw rechten",
        body: "Op grond van de AVG heeft u het recht om:\n\n- Toegang te krijgen tot uw persoonsgegevens.\n- Onjuiste gegevens te corrigeren.\n- Verwijdering van uw gegevens te verzoeken.\n- Verwerking te beperken of er bezwaar tegen te maken.\n- Gegevensoverdraagbaarheid.\n- Toestemming op elk moment in te trekken.\n\nOm deze rechten uit te oefenen, neem contact met ons op via privacy@golflessons.be.",
      },
      {
        heading: "8. Cookies",
        body: "Wij gebruiken essenti\u00eble cookies voor authenticatie en sessiebeheer. Wij gebruiken geen reclame- of trackingcookies.",
      },
      {
        heading: "9. Beveiliging",
        body: "Wij gebruiken standaard beveiligingsmaatregelen waaronder HTTPS-encryptie, veilige wachtwoordhashing en toegangscontroles om uw gegevens te beschermen.",
      },
      {
        heading: "10. Contact",
        body: "Voor privacygerelateerde vragen kunt u contact met ons opnemen via privacy@golflessons.be.",
      },
    ],
  },
  fr: {
    title: "Politique de confidentialit\u00e9",
    lastUpdated: "Derni\u00e8re mise \u00e0 jour : avril 2026",
    sections: [
      {
        heading: "1. Qui sommes-nous",
        body: "Golf Lessons (golflessons.be) est une plateforme qui met en relation des \u00e9l\u00e8ves de golf avec des professionnels de golf pour la r\u00e9servation de cours, le coaching et la communication. La plateforme est exploit\u00e9e depuis la Belgique.",
      },
      {
        heading: "2. Quelles donn\u00e9es nous collectons",
        body: "Nous collectons les donn\u00e9es personnelles suivantes :\n\n- **Informations de compte** : nom, adresse e-mail, num\u00e9ro de t\u00e9l\u00e9phone, langue pr\u00e9f\u00e9r\u00e9e.\n- **Profil golf** : handicap, objectifs d'am\u00e9lioration.\n- **Donn\u00e9es de r\u00e9servation** : dates, heures, lieux des cours, pr\u00e9f\u00e9rences de planification.\n- **Donn\u00e9es de paiement** : les informations de moyen de paiement sont trait\u00e9es et stock\u00e9es par Stripe. Nous ne stockons pas les num\u00e9ros de carte sur nos serveurs.\n- **Donn\u00e9es de communication** : messages \u00e9chang\u00e9s entre \u00e9l\u00e8ves et pros via le chat de coaching.\n- **Donn\u00e9es techniques** : adresse IP, type de navigateur et informations sur l'appareil \u00e0 des fins de s\u00e9curit\u00e9 et d'analyse.",
      },
      {
        heading: "3. Pourquoi nous collectons vos donn\u00e9es",
        body: "Nous traitons vos donn\u00e9es personnelles aux fins suivantes :\n\n- Pour cr\u00e9er et g\u00e9rer votre compte.\n- Pour permettre les r\u00e9servations de cours entre \u00e9l\u00e8ves et pros.\n- Pour traiter les paiements via Stripe.\n- Pour faciliter la communication de coaching.\n- Pour envoyer des e-mails transactionnels (confirmations de r\u00e9servation, rappels, v\u00e9rification).\n- Pour am\u00e9liorer notre plateforme et nos services.",
      },
      {
        heading: "4. Base l\u00e9gale",
        body: "Nous traitons vos donn\u00e9es sur la base de :\n\n- **Ex\u00e9cution du contrat** : pour fournir les services auxquels vous vous \u00eates inscrit.\n- **Int\u00e9r\u00eat l\u00e9gitime** : pour am\u00e9liorer notre plateforme et pr\u00e9venir la fraude.\n- **Consentement** : pour les communications marketing optionnelles (vous pouvez vous d\u00e9sabonner \u00e0 tout moment via votre profil).",
      },
      {
        heading: "5. Qui a acc\u00e8s \u00e0 vos donn\u00e9es",
        body: "- **Les professionnels de golf** avec lesquels vous \u00eates connect\u00e9 peuvent voir votre nom, vos coordonn\u00e9es, votre historique de r\u00e9servation et vos messages de coaching.\n- **Stripe** traite vos donn\u00e9es de paiement sous sa propre politique de confidentialit\u00e9.\n- **Google Workspace** est utilis\u00e9 pour la livraison des e-mails.\n- Nous ne vendons pas vos donn\u00e9es \u00e0 des tiers.",
      },
      {
        heading: "6. Conservation des donn\u00e9es",
        body: "Nous conservons vos donn\u00e9es tant que votre compte est actif. Lorsque vous demandez la suppression de votre compte, vos donn\u00e9es personnelles sont supprim\u00e9es de mani\u00e8re douce et vos r\u00e9servations futures sont annul\u00e9es. L'historique des r\u00e9servations peut \u00eatre conserv\u00e9 \u00e0 des fins comptables et l\u00e9gales pendant 7 ans maximum.",
      },
      {
        heading: "7. Vos droits",
        body: "En vertu du RGPD, vous avez le droit de :\n\n- Acc\u00e9der \u00e0 vos donn\u00e9es personnelles.\n- Rectifier des donn\u00e9es inexactes.\n- Demander la suppression de vos donn\u00e9es.\n- Restreindre ou vous opposer au traitement.\n- La portabilit\u00e9 des donn\u00e9es.\n- Retirer votre consentement \u00e0 tout moment.\n\nPour exercer ces droits, contactez-nous \u00e0 privacy@golflessons.be.",
      },
      {
        heading: "8. Cookies",
        body: "Nous utilisons des cookies essentiels pour l'authentification et la gestion des sessions. Nous n'utilisons pas de cookies publicitaires ou de suivi.",
      },
      {
        heading: "9. S\u00e9curit\u00e9",
        body: "Nous utilisons des mesures de s\u00e9curit\u00e9 conformes aux normes de l'industrie, notamment le chiffrement HTTPS, le hachage s\u00e9curis\u00e9 des mots de passe et les contr\u00f4les d'acc\u00e8s pour prot\u00e9ger vos donn\u00e9es.",
      },
      {
        heading: "10. Contact",
        body: "Pour toute question relative \u00e0 la confidentialit\u00e9, contactez-nous \u00e0 privacy@golflessons.be.",
      },
    ],
  },
};

export default async function PrivacyPage() {
  const locale = await getLocale();
  const c = content[locale];

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-green-950">
        {c.title}
      </h1>
      <p className="mt-2 text-sm text-green-500">{c.lastUpdated}</p>
      <div className="mt-10 space-y-8">
        {c.sections.map((section, i) => (
          <div key={i}>
            <h2 className="font-display text-lg font-semibold text-green-900">
              {section.heading}
            </h2>
            <div
              className="mt-2 text-sm leading-relaxed text-green-700 [&_strong]:font-medium [&_strong]:text-green-800"
              dangerouslySetInnerHTML={{
                __html: section.body
                  .replace(/\n\n/g, "</p><p class='mt-3'>")
                  .replace(/\n- /g, "<br/>- ")
                  .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>"),
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
