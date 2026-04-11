import { getLocale } from "@/lib/locale";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Terms of Use — Golf Lessons" };

const content: Record<Locale, { title: string; lastUpdated: string; sections: Array<{ heading: string; body: string }> }> = {
  en: {
    title: "Terms of Use",
    lastUpdated: "Last updated: April 2026",
    sections: [
      {
        heading: "1. Acceptance of terms",
        body: "By creating an account or using Golf Lessons (golflessons.be), you agree to these Terms of Use. If you do not agree, please do not use the platform.",
      },
      {
        heading: "2. Description of service",
        body: "Golf Lessons is a platform that connects golf students with golf professionals. We provide tools for:\n\n- Browsing and selecting golf professionals.\n- Booking golf lessons.\n- Communicating with your pro via coaching chat.\n- Managing scheduling preferences and payments.\n\nGolf Lessons acts as an intermediary and is not a party to the agreement between students and pros.",
      },
      {
        heading: "3. Accounts",
        body: "You must provide accurate information when creating your account. You are responsible for maintaining the confidentiality of your password and for all activities under your account. You must notify us immediately of any unauthorized use.",
      },
      {
        heading: "4. Student accounts",
        body: "Students can create a free account to browse pros, book lessons, and communicate with their pro. Students are responsible for showing up to booked lessons and for paying any applicable lesson fees.",
      },
      {
        heading: "5. Pro accounts",
        body: "Golf professionals can subscribe to the platform to receive bookings, manage their schedule, and communicate with students. Pros are responsible for providing the lessons as agreed and for the accuracy of their profile information.",
      },
      {
        heading: "6. Bookings and cancellations",
        body: "Bookings are confirmed immediately upon submission. Cancellation policies are set by each pro individually and are visible during the booking process. Late cancellations or no-shows may be subject to charges as defined by the pro's cancellation policy.",
      },
      {
        heading: "7. Payments",
        body: "Lesson payments are processed through Stripe. Golf Lessons may charge a platform fee on transactions. All prices are displayed in euros (EUR). Payment terms and refund policies are communicated during the booking process.",
      },
      {
        heading: "8. Content and conduct",
        body: "You agree not to:\n\n- Use the platform for any unlawful purpose.\n- Upload harmful, offensive, or inappropriate content.\n- Impersonate another person.\n- Interfere with the platform's operation.\n- Use the platform to directly solicit pros or students outside the platform to avoid fees.",
      },
      {
        heading: "9. Intellectual property",
        body: "All content on the platform, including but not limited to text, graphics, logos, and software, is the property of Golf Lessons or its licensors and is protected by copyright and other intellectual property laws.",
      },
      {
        heading: "10. Limitation of liability",
        body: "Golf Lessons provides the platform \"as is\" and makes no warranties regarding the quality of lessons provided by pros. We are not liable for any direct, indirect, incidental, or consequential damages arising from the use of the platform or the services provided by pros.",
      },
      {
        heading: "11. Account termination",
        body: "We reserve the right to suspend or terminate accounts that violate these terms. You may request deletion of your account at any time. Upon deletion, future bookings will be cancelled automatically.",
      },
      {
        heading: "12. Changes to terms",
        body: "We may update these terms from time to time. We will notify you of significant changes via email or through the platform. Continued use of the platform after changes constitutes acceptance of the updated terms.",
      },
      {
        heading: "13. Governing law and disputes",
        body: "These Terms of Use are governed by the laws of Belgium. Any disputes arising from or in connection with these terms or the use of the platform shall be exclusively submitted to the courts of Turnhout, Belgium.",
      },
      {
        heading: "14. Contact",
        body: "For questions about these terms, contact us at info@golflessons.be.",
      },
    ],
  },
  nl: {
    title: "Gebruiksvoorwaarden",
    lastUpdated: "Laatst bijgewerkt: april 2026",
    sections: [
      {
        heading: "1. Aanvaarding van de voorwaarden",
        body: "Door een account aan te maken of Golf Lessons (golflessons.be) te gebruiken, gaat u akkoord met deze Gebruiksvoorwaarden. Als u niet akkoord gaat, gebruik het platform dan niet.",
      },
      {
        heading: "2. Beschrijving van de dienst",
        body: "Golf Lessons is een platform dat golfstudenten verbindt met golfprofessionals. Wij bieden tools voor:\n\n- Het bekijken en selecteren van golfprofessionals.\n- Het boeken van golflessen.\n- Communiceren met uw pro via coaching-chat.\n- Het beheren van planningsvoorkeuren en betalingen.\n\nGolf Lessons treedt op als tussenpersoon en is geen partij bij de overeenkomst tussen studenten en pro's.",
      },
      {
        heading: "3. Accounts",
        body: "U moet nauwkeurige informatie verstrekken bij het aanmaken van uw account. U bent verantwoordelijk voor het vertrouwelijk houden van uw wachtwoord en voor alle activiteiten onder uw account. U moet ons onmiddellijk op de hoogte stellen van ongeoorloofd gebruik.",
      },
      {
        heading: "4. Studentenaccounts",
        body: "Studenten kunnen een gratis account aanmaken om pro's te bekijken, lessen te boeken en te communiceren met hun pro. Studenten zijn verantwoordelijk voor het verschijnen op geboekte lessen en voor het betalen van eventuele lesgelden.",
      },
      {
        heading: "5. Pro-accounts",
        body: "Golfprofessionals kunnen zich abonneren op het platform om boekingen te ontvangen, hun schema te beheren en te communiceren met studenten. Pro's zijn verantwoordelijk voor het geven van de lessen zoals overeengekomen en voor de juistheid van hun profielinformatie.",
      },
      {
        heading: "6. Boekingen en annuleringen",
        body: "Boekingen worden onmiddellijk bevestigd na indiening. Annuleringsvoorwaarden worden door elke pro individueel ingesteld en zijn zichtbaar tijdens het boekingsproces. Late annuleringen of no-shows kunnen onderworpen zijn aan kosten zoals bepaald door het annuleringsbeleid van de pro.",
      },
      {
        heading: "7. Betalingen",
        body: "Lesbetalingen worden verwerkt via Stripe. Golf Lessons kan platformkosten in rekening brengen op transacties. Alle prijzen worden weergegeven in euro's (EUR). Betalingsvoorwaarden en terugbetalingsbeleid worden gecommuniceerd tijdens het boekingsproces.",
      },
      {
        heading: "8. Inhoud en gedrag",
        body: "U stemt ermee in om niet:\n\n- Het platform te gebruiken voor onwettige doeleinden.\n- Schadelijke, beledigende of ongepaste inhoud te uploaden.\n- Zich voor te doen als een andere persoon.\n- De werking van het platform te verstoren.\n- Het platform te gebruiken om rechtstreeks pro's of studenten buiten het platform te benaderen om kosten te vermijden.",
      },
      {
        heading: "9. Intellectueel eigendom",
        body: "Alle inhoud op het platform, inclusief maar niet beperkt tot tekst, afbeeldingen, logo's en software, is eigendom van Golf Lessons of haar licentiegevers en wordt beschermd door auteursrecht en andere intellectuele eigendomswetten.",
      },
      {
        heading: "10. Beperking van aansprakelijkheid",
        body: "Golf Lessons biedt het platform \"zoals het is\" aan en geeft geen garanties met betrekking tot de kwaliteit van lessen die door pro's worden gegeven. Wij zijn niet aansprakelijk voor directe, indirecte, incidentele of gevolgschade die voortvloeit uit het gebruik van het platform of de diensten die door pro's worden geleverd.",
      },
      {
        heading: "11. Accountbe\u00ebindiging",
        body: "Wij behouden ons het recht voor om accounts die deze voorwaarden schenden op te schorten of te be\u00ebindigen. U kunt op elk moment verzoeken om verwijdering van uw account. Bij verwijdering worden toekomstige boekingen automatisch geannuleerd.",
      },
      {
        heading: "12. Wijzigingen van voorwaarden",
        body: "Wij kunnen deze voorwaarden van tijd tot tijd bijwerken. Wij stellen u op de hoogte van belangrijke wijzigingen via e-mail of via het platform. Voortgezet gebruik van het platform na wijzigingen houdt aanvaarding van de bijgewerkte voorwaarden in.",
      },
      {
        heading: "13. Toepasselijk recht en geschillen",
        body: "Deze Gebruiksvoorwaarden worden beheerst door het Belgisch recht. Alle geschillen die voortvloeien uit of verband houden met deze voorwaarden of het gebruik van het platform worden uitsluitend voorgelegd aan de rechtbanken van Turnhout, Belgi\u00eb.",
      },
      {
        heading: "14. Contact",
        body: "Voor vragen over deze voorwaarden kunt u contact met ons opnemen via info@golflessons.be.",
      },
    ],
  },
  fr: {
    title: "Conditions d'utilisation",
    lastUpdated: "Derni\u00e8re mise \u00e0 jour : avril 2026",
    sections: [
      {
        heading: "1. Acceptation des conditions",
        body: "En cr\u00e9ant un compte ou en utilisant Golf Lessons (golflessons.be), vous acceptez les pr\u00e9sentes Conditions d'utilisation. Si vous n'\u00eates pas d'accord, veuillez ne pas utiliser la plateforme.",
      },
      {
        heading: "2. Description du service",
        body: "Golf Lessons est une plateforme qui met en relation des \u00e9l\u00e8ves de golf avec des professionnels de golf. Nous fournissons des outils pour :\n\n- Parcourir et s\u00e9lectionner des professionnels de golf.\n- R\u00e9server des cours de golf.\n- Communiquer avec votre pro via le chat de coaching.\n- G\u00e9rer les pr\u00e9f\u00e9rences de planification et les paiements.\n\nGolf Lessons agit en tant qu'interm\u00e9diaire et n'est pas partie \u00e0 l'accord entre les \u00e9l\u00e8ves et les pros.",
      },
      {
        heading: "3. Comptes",
        body: "Vous devez fournir des informations exactes lors de la cr\u00e9ation de votre compte. Vous \u00eates responsable du maintien de la confidentialit\u00e9 de votre mot de passe et de toutes les activit\u00e9s sous votre compte. Vous devez nous notifier imm\u00e9diatement de toute utilisation non autoris\u00e9e.",
      },
      {
        heading: "4. Comptes \u00e9tudiants",
        body: "Les \u00e9tudiants peuvent cr\u00e9er un compte gratuit pour parcourir les pros, r\u00e9server des cours et communiquer avec leur pro. Les \u00e9tudiants sont responsables de se pr\u00e9senter aux cours r\u00e9serv\u00e9s et de payer les frais de cours applicables.",
      },
      {
        heading: "5. Comptes pro",
        body: "Les professionnels de golf peuvent s'abonner \u00e0 la plateforme pour recevoir des r\u00e9servations, g\u00e9rer leur emploi du temps et communiquer avec les \u00e9tudiants. Les pros sont responsables de fournir les cours convenus et de l'exactitude de leurs informations de profil.",
      },
      {
        heading: "6. R\u00e9servations et annulations",
        body: "Les r\u00e9servations sont confirm\u00e9es imm\u00e9diatement apr\u00e8s soumission. Les politiques d'annulation sont d\u00e9finies par chaque pro individuellement et sont visibles pendant le processus de r\u00e9servation. Les annulations tardives ou les absences peuvent \u00eatre soumises \u00e0 des frais tels que d\u00e9finis par la politique d'annulation du pro.",
      },
      {
        heading: "7. Paiements",
        body: "Les paiements des cours sont trait\u00e9s par Stripe. Golf Lessons peut facturer des frais de plateforme sur les transactions. Tous les prix sont affich\u00e9s en euros (EUR). Les conditions de paiement et les politiques de remboursement sont communiqu\u00e9es pendant le processus de r\u00e9servation.",
      },
      {
        heading: "8. Contenu et conduite",
        body: "Vous acceptez de ne pas :\n\n- Utiliser la plateforme \u00e0 des fins ill\u00e9gales.\n- T\u00e9l\u00e9charger du contenu nuisible, offensant ou inappropri\u00e9.\n- Usurper l'identit\u00e9 d'une autre personne.\n- Interf\u00e9rer avec le fonctionnement de la plateforme.\n- Utiliser la plateforme pour solliciter directement des pros ou des \u00e9tudiants en dehors de la plateforme afin d'\u00e9viter les frais.",
      },
      {
        heading: "9. Propri\u00e9t\u00e9 intellectuelle",
        body: "Tout le contenu de la plateforme, y compris mais sans s'y limiter, les textes, graphiques, logos et logiciels, est la propri\u00e9t\u00e9 de Golf Lessons ou de ses conc\u00e9dants de licence et est prot\u00e9g\u00e9 par le droit d'auteur et d'autres lois sur la propri\u00e9t\u00e9 intellectuelle.",
      },
      {
        heading: "10. Limitation de responsabilit\u00e9",
        body: "Golf Lessons fournit la plateforme \u00ab en l'\u00e9tat \u00bb et ne donne aucune garantie concernant la qualit\u00e9 des cours dispens\u00e9s par les pros. Nous ne sommes pas responsables des dommages directs, indirects, accessoires ou cons\u00e9cutifs r\u00e9sultant de l'utilisation de la plateforme ou des services fournis par les pros.",
      },
      {
        heading: "11. R\u00e9siliation de compte",
        body: "Nous nous r\u00e9servons le droit de suspendre ou de r\u00e9silier les comptes qui enfreignent ces conditions. Vous pouvez demander la suppression de votre compte \u00e0 tout moment. En cas de suppression, les r\u00e9servations futures seront automatiquement annul\u00e9es.",
      },
      {
        heading: "12. Modifications des conditions",
        body: "Nous pouvons mettre \u00e0 jour ces conditions de temps \u00e0 autre. Nous vous informerons des changements importants par e-mail ou via la plateforme. L'utilisation continue de la plateforme apr\u00e8s les modifications constitue l'acceptation des conditions mises \u00e0 jour.",
      },
      {
        heading: "13. Droit applicable et litiges",
        body: "Les pr\u00e9sentes Conditions d'utilisation sont r\u00e9gies par le droit belge. Tout litige d\u00e9coulant de ou en rapport avec ces conditions ou l'utilisation de la plateforme sera exclusivement soumis aux tribunaux de Turnhout, Belgique.",
      },
      {
        heading: "14. Contact",
        body: "Pour toute question concernant ces conditions, contactez-nous \u00e0 info@golflessons.be.",
      },
    ],
  },
};

export default async function TermsPage() {
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
