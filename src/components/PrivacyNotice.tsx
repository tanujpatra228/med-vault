import type { ReactNode } from "react";
import { PRIVACY_UPDATED, PRIVACY_VERSION, type PrivacyMeta } from "@shared/privacy";
import { formatDate } from "@/lib/format";

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-rule py-5">
      <h2 className="mb-2 type-title">{title}</h2>
      <div className="flex flex-col gap-2 text-ink-muted [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">{children}</div>
    </section>
  );
}

/**
 * The privacy notice, in plain language (DPDP Rules, rule 3: what is collected, why, and how to
 * withdraw, use your rights and complain). Bump PRIVACY_VERSION when this changes materially:
 * every vault is then asked to agree again.
 */
export function PrivacyNotice({ meta }: { meta: PrivacyMeta | undefined }) {
  const contact = meta?.contact;
  const operator = meta?.operator;
  return (
    <div>
      <p className="meta text-ink-faint">
        Version {PRIVACY_VERSION} · {formatDate(PRIVACY_UPDATED)}
      </p>
      <p className="mt-3 statement-md">Med Vault keeps your family's medical records so you can see them on the phones you link. That is all it is for.</p>

      <Part title="Who runs this Med Vault">
        <p>
          {operator ? <strong>{operator}</strong> : "The person who shared this app with you"} runs this copy of Med Vault and is responsible for your data.
          {contact ? (
            <>
              {" "}
              Privacy questions, requests and complaints: <a className="text-iris underline" href={`mailto:${contact}`}>{contact}</a>.
            </>
          ) : (
            " Ask them directly for privacy questions, requests and complaints."
          )}
        </p>
      </Part>

      <Part title="What is stored">
        <ul>
          <li>The vault name, and a name for each linked phone with when it was last used.</li>
          <li>For each family member you add: name, relation, date of birth, sex, blood group, photo and notes.</li>
          <li>Health records you enter or scan: medicines and how to take them, prescriptions, reports and lab results, visits and follow-ups, allergies, health conditions and your notes.</li>
          <li>Photos and PDFs you upload, and doctors' names and contact details.</li>
          <li>Security data: phone keys and the recovery key, stored only as one-way fingerprints.</li>
          <li>An email address, only if you add one for security notices.</li>
          <li>If you turn on reminders: the phone's push address, time zone and reminder settings, and which reminders were sent in the last 3 days.</li>
          <li>Your internet (IP) address for up to 2 days, only to stop abuse such as mass vault creation; and a count of AI use per vault.</li>
        </ul>
        <p>No account, phone number, Aadhaar or payment details are asked for. No advertising, no tracking, no analytics, and your data is never sold.</p>
      </Part>

      <Part title="Why it is used">
        <ul>
          <li>To show and organise your family's records on the phones linked to your vault.</li>
          <li>If you allow it: to read photos of prescriptions, medicine strips and reports with AI, and to check your medicines together. You check everything before it is saved.</li>
          <li>To keep the service safe and fair (limits on vault creation and AI use).</li>
          <li>To tell you about a security problem, if you added an email.</li>
        </ul>
      </Part>

      <Part title="AI reading (optional)">
        <p>
          When you scan a photo, it is sent to our cloud AI provider (open AI models such as Llama 4 Scout or Mistral Small) to read the text. Medicine checks send the list of current
          medicines, allergies, conditions, age and sex. The provider does not use it to train AI models or share it with other customers. The AI result only fills a form; nothing is saved
          until you tap Save.
        </p>
        <p>AI is off until you allow it, and you can switch it off any time in Settings. Everything works without it.</p>
      </Part>

      <Part title="Reminders (optional)">
        <p>
          If you turn on reminders on a phone, Med Vault keeps that phone's push address, time zone and reminder settings, and sends notifications through the phone's push service (Google
          on Android). Messages are encrypted to the phone, so the push service cannot read them. Choose whether names appear on the lock screen, and turn reminders off any time in Settings.
        </p>
      </Part>

      <Part title="Where it is kept, and who helps">
        <p>
          Records and files are stored with a cloud hosting provider (database, file storage and AI), which processes them only to run Med Vault. Its data centres can be in or outside
          India. Data is encrypted in transit and at rest, and each vault can only be opened by its own linked phones.
        </p>
      </Part>

      <Part title="How long it is kept">
        <p>
          Until you delete it. Deleting a record, a family member or the whole vault removes it straight away. Database recovery copies can hold deleted data for up to 30 days, after
          which it is gone for good.
        </p>
      </Part>

      <Part title="Your rights">
        <ul>
          <li>
            <strong>See and take a copy:</strong> Settings → Backup downloads everything.
          </li>
          <li>
            <strong>Correct:</strong> every record can be edited.
          </li>
          <li>
            <strong>Delete and withdraw consent:</strong> delete any record, or the whole vault in Settings. Switch off AI in Settings.
          </li>
          <li>
            <strong>Nominate someone:</strong> give your recovery key to a person you trust, so they can open the vault if you cannot.
          </li>
          <li>
            <strong>Complain:</strong> {contact ? `write to ${contact}` : "contact the person who runs this Med Vault"}. If you are not satisfied, you can complain to the Data Protection Board of India.
          </li>
        </ul>
      </Part>

      <Part title="Children and other family members">
        <p>
          The person who creates the vault confirms they are 18 or older, and that they add records for themselves, as a parent or guardian, or with the family member's permission.
        </p>
      </Part>

      <Part title="If something goes wrong">
        <p>
          If your data is exposed in a security incident, we will tell the Data Protection Board of India and you: in the app, and by email if you added one.
        </p>
      </Part>

      <Part title="Changes">
        <p>When this notice changes, you will be asked to agree again before using the app.</p>
        <p>Med Vault organises records; it does not give medical advice. Always follow your doctor.</p>
      </Part>
    </div>
  );
}
