import { Linking, Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export type CertificateData = {
  id: string;
  certificateNo: string;
  title: string;
  childName: string;
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

export function certificateHtml(c: CertificateData) {
  const cat = c.category;
  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>${escape(c.appName)} Certificate ${escape(c.certificateNo)}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Trebuchet MS", "Segoe UI", Arial, sans-serif; background: #fff; }
  .page { width: 297mm; height: 210mm; padding: 12mm; }
  .frame { height: 100%; border: 6px solid #6C4CF1; border-radius: 18px; padding: 8px;
           background: linear-gradient(135deg, #FFF8E1 0%, #F3EEFF 55%, #E6F7FF 100%); }
  .inner { height: 100%; border: 2px dashed #F5B700; border-radius: 12px; display: flex;
           flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 10mm; }
  .brand { font-size: 30px; font-weight: 900; letter-spacing: 6px; color: #6C4CF1; }
  .kind { font-size: 20px; font-weight: 800; color: #F08A00; margin-top: 4px; letter-spacing: 2px; }
  .lead { font-size: 16px; color: #555; margin-top: 18px; }
  .name { font-size: 46px; font-weight: 900; color: #222; margin: 6px 0 4px; }
  .line { width: 50%; border-bottom: 3px solid #F5B700; margin-bottom: 12px; }
  .for { font-size: 17px; color: #444; }
  .cat { font-size: 32px; font-weight: 900; color: #2E7D32; margin-top: 6px; }
  .stars { font-size: 26px; margin-top: 8px; letter-spacing: 6px; }
  .foot { display: flex; justify-content: space-between; width: 86%; margin-top: 22px; font-size: 14px; color: #333; }
  .foot b { display: block; font-size: 15px; }
  .sign { border-top: 2px solid #999; padding-top: 4px; min-width: 160px; }
</style></head><body><div class="page"><div class="frame"><div class="inner">
  <div class="brand">${escape(c.appName)}</div>
  <div class="kind">CERTIFICATE OF ACHIEVEMENT</div>
  <div class="lead">This certificate is proudly presented to</div>
  <div class="name">${escape(c.childName)}</div>
  <div class="line"></div>
  <div class="for">for learning all ${cat?.wordCount ?? ""} words in</div>
  <div class="cat">${escape(cat?.emoji ?? "")} ${escape(cat?.label ?? c.title)}</div>
  <div class="stars">⭐ ⭐ ⭐</div>
  <div class="foot">
    <div><b>${escape(formatCertificateDate(c.issuedAt))}</b>Date of completion</div>
    <div class="sign"><b>${escape(c.appName)} Team</b>Kids Learning Academy</div>
    <div><b>${escape(c.certificateNo)}</b>Certificate No.</div>
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
