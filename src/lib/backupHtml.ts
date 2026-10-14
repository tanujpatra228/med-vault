import type { BackupData, BackupFile } from "@shared/backup";
import { REPORT_TYPES } from "@shared/types";
import { describe as describeSchedule } from "@shared/schedule";
import { formatDate, plural, today } from "./format";
import { medView } from "./meds";

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const CSS = `
body{font:15px/1.5 system-ui,sans-serif;color:#171221;background:#fbfaf7;max-width:860px;margin:0 auto;padding:24px 16px}
h1{font:600 30px/1.2 Georgia,serif;margin:0 0 4px}h2{font:600 24px/1.3 Georgia,serif;margin:40px 0 4px;padding-top:24px;border-top:2px solid #171221}
h3{font:500 12px/1.4 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#6a6376;margin:24px 0 8px}
.muted{color:#6a6376}.card{background:#fff;border:1px solid #dfdacf;border-radius:3px;padding:10px 12px;margin:0 0 8px}
.allergy{background:#f7eae2;border:1px solid #a8450f;color:#a8450f;border-radius:3px;padding:10px 12px}
.flag{display:inline-block;font-size:12px;border:1px solid currentColor;border-radius:3px;padding:0 6px;margin-left:6px;color:#a8450f}
.files{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.files a{display:block}.files img{height:96px;border:1px solid #dfdacf;border-radius:3px}
ul{margin:0;padding-left:18px}a{color:#5b34d6}
@media print{.files img{height:72px}h2{break-before:page}}`;

function filesHtml(files: BackupFile[]) {
  if (!files.length) return "";
  const items = files
    .filter((f) => f.path)
    .map((f) => {
      const href = encodeURI(f.path!);
      return f.mime_type.startsWith("image/")
        ? `<a href="${href}"><img src="${href}" alt="${esc(f.name)}" loading="lazy"></a>`
        : `<a href="${href}">${esc(f.name ?? "Document")} (PDF)</a>`;
    });
  return `<div class="files">${items.join("")}</div>`;
}

/**
 * "Open me.html": the whole vault as one readable page that opens in any browser, straight from
 * the unzipped backup, without Med Vault. Photos are linked from the files folder.
 */
export function backupHtml(d: BackupData): string {
  const date = today();
  const filesOf = (type: string, id: string) => d.files.filter((f) => f.owner_type === type && f.owner_id === id);
  const doctor = (id: string | null) => d.doctors.find((x) => x.id === id);
  const condition = (id: string | null) => d.conditions.find((x) => x.id === id);
  const doctorLabel = (id: string | null) => {
    const doc = doctor(id);
    return doc ? `${doc.name}${doc.specialty ? ` (${doc.specialty})` : ""}` : "";
  };
  const newest = <T,>(rows: T[], key: (r: T) => string | null) => [...rows].sort((a, b) => (key(b) ?? "").localeCompare(key(a) ?? ""));

  const medHtml = (m: BackupData["medications"][number]) => {
    const v = medView(m, date);
    const lines = v.schedule
      ? describeSchedule(v.schedule, m.start_date, { timing: m.timing, form: m.form }).flatMap((p) => (p.heading ? [`${p.heading}: ${p.lines.join(" ")}`] : p.lines))
      : m.dosage
        ? [m.dosage]
        : [];
    return `<div class="card"><b>${esc(m.name)}</b>${m.strength ? ` <span class="muted">${esc(m.strength)}</span>` : ""}${v.weekly ? '<span class="flag">Weekly</span>' : ""}${v.taper ? '<span class="flag">Changing dose</span>' : ""}
      ${lines.map((l) => `<div>${esc(l)}</div>`).join("")}
      <div class="muted">${[m.timing, doctorLabel(m.doctor_id) && `From ${doctorLabel(m.doctor_id)}`, m.start_date && `Since ${formatDate(m.start_date)}`, m.end_date && `Until ${formatDate(m.end_date)}`].filter(Boolean).map(esc).join(" · ")}</div>
      ${m.notes ? `<div class="muted">${esc(m.notes)}</div>` : ""}${filesHtml(filesOf("medication", m.id))}</div>`;
  };

  const members = d.members.map((mb) => {
    const allergies = d.allergies.filter((a) => a.member_id === mb.id);
    const conditions = d.conditions.filter((k) => k.member_id === mb.id);
    const meds = d.medications.filter((m) => m.member_id === mb.id);
    const current = newest(meds.filter((m) => medView(m, date).current), (m) => m.start_date ?? m.created_at);
    const past = newest(meds.filter((m) => !medView(m, date).current), (m) => m.start_date ?? m.created_at);
    const rx = newest(d.prescriptions.filter((p) => p.member_id === mb.id), (p) => p.prescribed_on);
    const reports = newest(d.reports.filter((r) => r.member_id === mb.id), (r) => r.report_date);
    const facts = [mb.relation, mb.dob && `Born ${formatDate(mb.dob)}`, mb.sex, mb.blood_group && `Blood ${mb.blood_group}`].filter(Boolean).map((x) => esc(x as string));

    return `<section><h2>${esc(mb.name)}</h2>${facts.length ? `<div class="muted">${facts.join(" · ")}</div>` : ""}
      ${mb.notes ? `<p>${esc(mb.notes)}</p>` : ""}${filesHtml(filesOf("member", mb.id))}
      <h3>Allergies</h3><div class="allergy">${allergies.length ? allergies.map((a) => `<div><b>${esc(a.allergen)}</b>${a.reaction ? ` · ${esc(a.reaction)}` : ""} · ${esc(a.severity)}</div>`).join("") : "None recorded"}</div>
      <h3>Health conditions</h3>${conditions.length ? `<ul>${conditions.map((k) => `<li>${esc(k.name)} <span class="muted">· ${esc(k.status)}${k.diagnosed_on ? ` · since ${formatDate(k.diagnosed_on)}` : ""}</span></li>`).join("")}</ul>` : '<p class="muted">None recorded</p>'}
      <h3>Current medicines · ${current.length}</h3>${current.map(medHtml).join("") || '<p class="muted">None</p>'}
      <h3>Prescriptions · ${rx.length}</h3>${
        rx
          .map((p) => {
            const pm = meds.filter((m) => m.prescription_id === p.id);
            return `<div class="card"><b>${formatDate(p.prescribed_on)}</b>${doctorLabel(p.doctor_id) ? ` · ${esc(doctorLabel(p.doctor_id))}` : ""}${condition(p.condition_id) ? ` <span class="muted">· ${esc(condition(p.condition_id)!.name)}</span>` : ""}
            ${pm.length ? `<ul>${pm.map((m) => `<li>${esc(m.name)}${m.strength ? ` ${esc(m.strength)}` : ""}${m.dosage ? ` <span class="muted">· ${esc(m.dosage)}</span>` : ""}</li>`).join("")}</ul>` : ""}
            ${p.notes ? `<div class="muted">${esc(p.notes)}</div>` : ""}${filesHtml(filesOf("prescription", p.id))}</div>`;
          })
          .join("") || '<p class="muted">None</p>'
      }
      <h3>Reports · ${reports.length}</h3>${
        reports
          .map(
            (r) => `<div class="card"><b>${formatDate(r.report_date)}</b> · ${esc(r.title)} <span class="muted">· ${esc(REPORT_TYPES.find((t) => t.value === r.report_type)?.label ?? "Report")}${r.lab_name ? ` · ${esc(r.lab_name)}` : ""}</span>
            ${r.notes ? `<div class="muted">${esc(r.notes)}</div>` : ""}${filesHtml(filesOf("report", r.id))}</div>`,
          )
          .join("") || '<p class="muted">None</p>'
      }
      ${(() => {
        const vs = newest((d.visits ?? []).filter((v) => v.member_id === mb.id), (v) => v.visit_date);
        return vs.length
          ? `<h3>Visits · ${vs.length}</h3>${vs
              .map(
                (v) => `<div class="card"><b>${formatDate(v.visit_date)}</b>${doctorLabel(v.doctor_id) ? ` · ${esc(doctorLabel(v.doctor_id))}` : ""}${v.reason ? ` <span class="muted">· ${esc(v.reason)}</span>` : ""}
              ${v.notes ? `<div>${esc(v.notes)}</div>` : ""}${v.follow_up_on ? `<div class="muted">Follow-up: ${formatDate(v.follow_up_on)}${v.follow_up_note ? ` · ${esc(v.follow_up_note)}` : ""}</div>` : ""}</div>`,
              )
              .join("")}`
          : "";
      })()}
      ${past.length ? `<h3>Past medicines · ${past.length}</h3>${past.map(medHtml).join("")}` : ""}
    </section>`;
  });

  const doctors = d.doctors.length
    ? `<section><h2>Doctors</h2>${d.doctors.map((doc) => `<div class="card"><b>${esc(doc.name)}</b>${doc.specialty ? ` · ${esc(doc.specialty)}` : ""}<div class="muted">${[doc.clinic, doc.phone, doc.address].filter(Boolean).map((x) => esc(x)).join(" · ")}</div></div>`).join("")}</section>`
    : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.vault.name)}: Med Vault backup</title><style>${CSS}</style></head><body>
<h1>${esc(d.vault.name)}</h1><div class="muted">Med Vault backup · ${formatDate(d.exported_at.slice(0, 10))} · ${plural(d.members.length, "member")} · ${plural(d.files.length, "file")}</div>
<p class="muted">To restore: open Med Vault, create a new vault, tap "Restore from a backup" and pick this ZIP file.</p>
${members.join("")}${doctors}</body></html>`;
}
