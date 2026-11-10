import { Linking, Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export type CertificateData = {
  id: string;
  certificateNo: string;
  title: string;
  childName: string;
  /** data:image URL of the child / profile photo; null shows the child's initial. */
  photoUrl?: string | null;
  category: { label: string; emoji: string; wordCount: number } | null;
  issuedAt: string;
  appName: string;
};

export function formatCertificateDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const SAFE_PHOTO = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i;

/** Rainbow letters for the child's name. */
const NAME_COLORS = ["#E53935", "#FB8C00", "#F4B400", "#43A047", "#1E88E5", "#8E24AA", "#D81B60"];

function rainbowName(name: string) {
  return Array.from(name)
    .map((ch, i) =>
      ch.trim() ? `<span style="color:${NAME_COLORS[i % NAME_COLORS.length]}">${escape(ch)}</span>` : " "
    )
    .join("");
}

export function certificateHtml(c: CertificateData) {
  const cat = c.category;
  const photo =
    c.photoUrl && SAFE_PHOTO.test(c.photoUrl)
      ? `<img class="photo" src="${c.photoUrl}" alt=""/>`
      : `<div class="photo initial">${escape(Array.from(c.childName.trim())[0]?.toUpperCase() ?? "⭐")}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>${escape(c.appName)} Certificate ${escape(c.certificateNo)}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; background: #fff; }
  body { font-family: "Comic Sans MS", "Chalkboard SE", "Baloo 2", "Trebuchet MS", "Segoe UI", Arial, sans-serif; }
  .page { width: 297mm; height: 210mm; padding: 8mm; }
  .frame { position: relative; height: 100%; border-radius: 26px; padding: 9px;
           background: linear-gradient(90deg, #FF5252, #FF9800, #FFD600, #4CAF50, #2196F3, #7C4DFF, #E040FB); }
  .inner { position: relative; height: 100%; border-radius: 19px; overflow: hidden;
           background:
             radial-gradient(circle at 8% 18%, #FFE082 0 7px, transparent 8px),
             radial-gradient(circle at 92% 14%, #80DEEA 0 9px, transparent 10px),
             radial-gradient(circle at 14% 86%, #F48FB1 0 8px, transparent 9px),
             radial-gradient(circle at 88% 84%, #A5D6A7 0 10px, transparent 11px),
             radial-gradient(circle at 50% 6%, #CE93D8 0 5px, transparent 6px),
             radial-gradient(circle at 30% 94%, #90CAF9 0 6px, transparent 7px),
             radial-gradient(circle at 72% 95%, #FFCC80 0 6px, transparent 7px),
             linear-gradient(160deg, #FFF8E1 0%, #FCE4EC 38%, #E3F2FD 72%, #E8F5E9 100%);
           display: flex; align-items: center; padding: 10mm 14mm; gap: 12mm; }
  .corner { position: absolute; font-size: 40px; }
  .tl { top: 10px; left: 16px; } .tr { top: 10px; right: 16px; }
  .bl { bottom: 8px; left: 16px; } .br { bottom: 8px; right: 16px; }
  .left { flex: 0 0 74mm; display: flex; flex-direction: column; align-items: center; }
  .ring { width: 68mm; height: 68mm; border-radius: 50%; padding: 7px;
          background: conic-gradient(#FF5252, #FF9800, #FFD600, #4CAF50, #2196F3, #7C4DFF, #E040FB, #FF5252);
          box-shadow: 0 6px 18px rgba(124, 77, 255, 0.25); }
  .photo { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 6px solid #fff; background: #fff; display: block; }
  .initial { display: flex; align-items: center; justify-content: center; font-size: 110px; font-weight: 900;
             color: #fff; background: linear-gradient(135deg, #7C4DFF, #29B6F6); }
  .medal { font-size: 54px; margin-top: -26px; }
  .stars { font-size: 30px; letter-spacing: 6px; margin-top: 2px; }
  .right { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .brand { font-size: 30px; font-weight: 900; letter-spacing: 6px; color: #7C4DFF; }
  .ribbon { margin-top: 8px; padding: 9px 34px; border-radius: 999px; color: #fff; font-size: 21px; font-weight: 900;
            letter-spacing: 2px; background: linear-gradient(90deg, #FF7043, #EC407A, #AB47BC);
            box-shadow: 0 4px 10px rgba(236, 64, 122, 0.3); }
  .lead { font-size: 17px; color: #5D4037; margin-top: 16px; font-weight: 700; }
  .name { font-size: 54px; font-weight: 900; margin: 4px 0 2px; line-height: 1.1; }
  .line { width: 70%; height: 6px; border-radius: 3px; margin-bottom: 12px;
          background: linear-gradient(90deg, #FFD600, #FF9800, #FF5252); }
  .for { font-size: 18px; color: #37474F; font-weight: 700; }
  .cat { margin-top: 10px; padding: 8px 26px; border-radius: 18px; background: #E8F5E9; border: 3px solid #66BB6A;
         font-size: 32px; font-weight: 900; color: #2E7D32; }
  .cheer { margin-top: 10px; font-size: 18px; font-weight: 900; color: #F57C00; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; width: 100%; margin-top: 18px; gap: 10px; }
  .chip { background: #fff; border-radius: 14px; padding: 8px 14px; border: 2px solid #E1D5FF; font-size: 12px; color: #6D6D80; }
  .chip b { display: block; font-size: 15px; color: #311B92; }
  .sign { text-align: center; font-size: 12px; color: #6D6D80; }
  .sign b { display: block; font-size: 15px; color: #311B92; border-top: 2px dashed #B39DDB; padding-top: 4px; min-width: 150px; }
</style></head><body><div class="page"><div class="frame"><div class="inner">
  <div class="corner tl">🎈</div><div class="corner tr">🌈</div>
  <div class="corner bl">🎉</div><div class="corner br">🚀</div>
  <div class="left">
    <div class="ring">${photo}</div>
    <div class="medal">🏅</div>
    <div class="stars">⭐⭐⭐</div>
  </div>
  <div class="right">
    <div class="brand">${escape(c.appName)}</div>
    <div class="ribbon">🏆 CERTIFICATE OF ACHIEVEMENT 🏆</div>
    <div class="lead">This certificate is proudly presented to</div>
    <div class="name">${rainbowName(c.childName)}</div>
    <div class="line"></div>
    <div class="for">for learning all ${cat?.wordCount ?? ""} words in</div>
    <div class="cat">${escape(cat?.emoji ?? "🎓")} ${escape(cat?.label ?? c.title)}</div>
    <div class="cheer">Super job! Keep shining! ✨</div>
    <div class="foot">
      <div class="chip"><b>${escape(formatCertificateDate(c.issuedAt))}</b>Date of completion</div>
      <div class="sign"><b>${escape(c.appName)} Team</b>Kids Learning Academy</div>
      <div class="chip"><b>${escape(c.certificateNo)}</b>Certificate No.</div>
    </div>
  </div>
</div></div></div></body></html>`;
}

export function certificateShareText(c: CertificateData) {
  return `🎉 ${c.childName} earned the ${c.appName} certificate for learning all the ${
    c.category?.label ?? ""
  } words! Certificate No. ${c.certificateNo}`;
}

async function nativePdfUri(c: CertificateData) {
  const { uri } = await Print.printToFileAsync({ html: certificateHtml(c), width: 842, height: 595 });
  return uri;
}

/** Web: opens the browser print dialog (choose "Save as PDF"). Phone: creates the PDF and opens save/share. */
export async function downloadCertificatePdf(c: CertificateData) {
  if (Platform.OS === "web") {
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);
    const doc = frame.contentWindow!.document;
    doc.open();
    doc.write(certificateHtml(c));
    doc.close();
    setTimeout(() => {
      frame.contentWindow!.focus();
      frame.contentWindow!.print();
      setTimeout(() => frame.remove(), 60_000);
    }, 300);
    return;
  }
  const uri = await nativePdfUri(c);
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: "Save certificate PDF",
  });
}

/** Phone share menu (WhatsApp etc.) with the PDF; on the web, the browser share menu or WhatsApp Web. */
export async function shareCertificate(c: CertificateData) {
  const text = certificateShareText(c);
  if (Platform.OS === "web") {
    const nav = globalThis.navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav?.share) {
      try {
        await nav.share({ title: `${c.appName} certificate`, text });
        return;
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
      }
    }
    await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`);
    return;
  }
  const uri = await nativePdfUri(c);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: text,
    });
  } else {
    await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(text)}`);
  }
}
