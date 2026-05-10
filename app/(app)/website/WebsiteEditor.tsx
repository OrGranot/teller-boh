"use client";
import SectionCard      from "@/components/website/SectionCard";
import InlineText       from "@/components/website/InlineText";
import TextBox          from "@/components/website/TextBox";
import ImageField       from "@/components/website/ImageField";
import PDFField         from "@/components/website/PDFField";
import ParagraphsEditor from "@/components/website/ParagraphsEditor";
import FeaturesEditor   from "@/components/website/FeaturesEditor";
import HoursEditor      from "@/components/website/HoursEditor";
import FAQEditor        from "@/components/website/FAQEditor";
import PublishButton    from "@/components/website/PublishButton";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Site {
  name: string; tagline_en: string; tagline_de: string;
  description_en: string; description_de: string;
  email: string; address: string; city: string; postal_code: string;
  neighborhood: string; vat: string; instagram: string; opentable: string;
  hero_image: string; hero_position: string;
}
interface About {
  title_en: string; title_de: string; image: string; image_position: string;
  paragraphs: { en: string; de: string }[];
}
interface Events {
  title_en: string; title_de: string;
  description_en: string; description_de: string;
  features: { en: string; de: string }[];
}
interface FAQ {
  id?: string; sort_order: number;
  question_en: string; question_de: string;
  answer_en: string; answer_de: string;
}
interface Gallery {
  strip: { src: string; alt: string }[];
  experiences: Record<string, string>;
  private_dining: string; private_dining_position: string;
}
interface Hours {
  opening: { day_en: string; day_de: string; time?: string; time_en?: string; time_de?: string }[];
  seatings: { name_en: string; name_de: string; time?: string; time_en?: string; time_de?: string }[];
}
interface Menus {
  food_en_image: string; food_en_pdf: string;
  food_de_image: string; food_de_pdf: string;
  couples_image: string; couples_pdf: string;
  drinks_image: string;  drinks_pdf: string;
  note_en: string; note_de: string;
  disclaimer_en: string; disclaimer_de: string;
}
interface Press {
  outlets: string[];
  quotes: { text: string; source: string }[];
}
interface Vouchers { amounts: number[]; default_amount: number; validity_years: number; }

interface Props {
  site: Site; about: About; events: Events; faq: FAQ[];
  gallery: Gallery; hours: Hours; menus: Menus; press: Press; vouchers: Vouchers;
}

// ─── Save helper ─────────────────────────────────────────────────────────────

async function save(table: string, data: unknown) {
  await fetch("/api/website/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table, data }),
  });
}

// ─── Reusable label ──────────────────────────────────────────────────────────

function BiLabel({ label }: { label: string }) {
  return <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">{label}</p>;
}

function BiRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-6">{children}</div>;
}

function Lang({ lang }: { lang: "EN" | "DE" }) {
  return (
    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${lang === "EN" ? "bg-blue-100 text-blue-600" : "bg-yellow-100 text-yellow-700"}`}>
      {lang}
    </span>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WebsiteEditor({ site, about, events, faq, gallery, hours, menus, press, vouchers }: Props) {
  return (
    <div className="px-6 py-8 space-y-6 max-w-4xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Website Editor</h1>
          <p className="text-sm text-gray-400 mt-0.5">Changes save instantly. Click Publish to rebuild the live site.</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="https://www.tellerberlin.com" target="_blank" rel="noopener"
             className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2">
            View live site ↗
          </a>
          <PublishButton />
        </div>
      </div>

      {/* ── Site Config ── */}
      <SectionCard title="Site" description="Global settings used across all pages">
        <div className="space-y-4">
          <div>
            <BiLabel label="Restaurant name" />
            <InlineText value={site.name} onSave={v => save("website_site", { name: v })} className="text-lg font-semibold text-gray-800" />
          </div>
          <div>
            <BiLabel label="Tagline" />
            <BiRow>
              <div className="space-y-1"><Lang lang="EN" /><InlineText value={site.tagline_en} onSave={v => save("website_site", { tagline_en: v })} className="text-sm text-gray-600" /></div>
              <div className="space-y-1"><Lang lang="DE" /><InlineText value={site.tagline_de} onSave={v => save("website_site", { tagline_de: v })} className="text-sm text-gray-600" /></div>
            </BiRow>
          </div>
          <div>
            <BiLabel label="Meta description (SEO)" />
            <BiRow>
              <div className="space-y-1"><Lang lang="EN" /><TextBox value={site.description_en} onSave={v => save("website_site", { description_en: v })} rows={2} /></div>
              <div className="space-y-1"><Lang lang="DE" /><TextBox value={site.description_de} onSave={v => save("website_site", { description_de: v })} rows={2} /></div>
            </BiRow>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><BiLabel label="Email" /><InlineText value={site.email} onSave={v => save("website_site", { email: v })} className="text-sm" /></div>
            <div><BiLabel label="Address" /><InlineText value={site.address} onSave={v => save("website_site", { address: v })} className="text-sm" /></div>
            <div><BiLabel label="VAT" /><InlineText value={site.vat} onSave={v => save("website_site", { vat: v })} className="text-sm" /></div>
          </div>
          <div>
            <BiLabel label="OpenTable URL" />
            <InlineText value={site.opentable} onSave={v => save("website_site", { opentable: v })} className="text-xs text-blue-500" />
          </div>
          <div>
            <BiLabel label="Hero image" />
            <ImageField src={site.hero_image} alt="Hero" onSave={v => save("website_site", { hero_image: v })} aspectRatio="21/6" className="w-full" />
          </div>
        </div>
      </SectionCard>

      {/* ── About ── */}
      <SectionCard title="About" description="The story section on the home page">
        <div>
          <BiLabel label="Section title" />
          <BiRow>
            <div className="space-y-1"><Lang lang="EN" /><InlineText value={about.title_en} onSave={v => save("website_about", { title_en: v })} className="text-base font-semibold" /></div>
            <div className="space-y-1"><Lang lang="DE" /><InlineText value={about.title_de} onSave={v => save("website_about", { title_de: v })} className="text-base font-semibold" /></div>
          </BiRow>
        </div>
        <div className="grid grid-cols-[1fr_260px] gap-6 items-start">
          <div>
            <BiLabel label="Paragraphs" />
            <ParagraphsEditor paragraphs={about.paragraphs} onSave={p => save("website_about", { paragraphs: p })} />
          </div>
          <div>
            <BiLabel label="Photo" />
            <ImageField src={about.image} alt="About" onSave={v => save("website_about", { image: v })} aspectRatio="4/5" />
          </div>
        </div>
      </SectionCard>

      {/* ── Menus ── */}
      <SectionCard title="Menus" description="Upload new menu images and PDFs">
        <div className="space-y-6">
          <div>
            <BiLabel label="Food menu — English" />
            <div className="grid grid-cols-[180px_1fr] gap-4 items-start">
              <ImageField src={menus.food_en_image} alt="Food menu EN" onSave={v => save("website_menus", { food_en_image: v })} aspectRatio="3/4" />
              <div className="pt-2"><PDFField url={menus.food_en_pdf} label="Food Menu (EN)" onSave={v => save("website_menus", { food_en_pdf: v })} /></div>
            </div>
          </div>
          <div>
            <BiLabel label="Food menu — Deutsch" />
            <div className="grid grid-cols-[180px_1fr] gap-4 items-start">
              <ImageField src={menus.food_de_image} alt="Food menu DE" onSave={v => save("website_menus", { food_de_image: v })} aspectRatio="3/4" />
              <div className="pt-2"><PDFField url={menus.food_de_pdf} label="Speisekarte (DE)" onSave={v => save("website_menus", { food_de_pdf: v })} /></div>
            </div>
          </div>
          <div>
            <BiLabel label="Couples menu" />
            <div className="grid grid-cols-[180px_1fr] gap-4 items-start">
              <ImageField src={menus.couples_image} alt="Couples menu" onSave={v => save("website_menus", { couples_image: v })} aspectRatio="3/4" />
              <div className="pt-2"><PDFField url={menus.couples_pdf} label="Couples Menu" onSave={v => save("website_menus", { couples_pdf: v })} /></div>
            </div>
          </div>
          <div>
            <BiLabel label="Drinks menu" />
            <div className="grid grid-cols-[180px_1fr] gap-4 items-start">
              <ImageField src={menus.drinks_image} alt="Drinks menu" onSave={v => save("website_menus", { drinks_image: v })} aspectRatio="3/4" />
              <div className="pt-2"><PDFField url={menus.drinks_pdf} label="Drinks Menu" onSave={v => save("website_menus", { drinks_pdf: v })} /></div>
            </div>
          </div>
          <div>
            <BiLabel label="Menu note" />
            <BiRow>
              <div className="space-y-1"><Lang lang="EN" /><TextBox value={menus.note_en} onSave={v => save("website_menus", { note_en: v })} rows={2} /></div>
              <div className="space-y-1"><Lang lang="DE" /><TextBox value={menus.note_de} onSave={v => save("website_menus", { note_de: v })} rows={2} /></div>
            </BiRow>
          </div>
        </div>
      </SectionCard>

      {/* ── Private Dining / Events ── */}
      <SectionCard title="Private Dining & Events" description="Shown on the home page and the /events page">
        <div>
          <BiLabel label="Section title" />
          <BiRow>
            <div className="space-y-1"><Lang lang="EN" /><InlineText value={events.title_en} onSave={v => save("website_events", { title_en: v })} className="text-base font-semibold" /></div>
            <div className="space-y-1"><Lang lang="DE" /><InlineText value={events.title_de} onSave={v => save("website_events", { title_de: v })} className="text-base font-semibold" /></div>
          </BiRow>
        </div>
        <div>
          <BiLabel label="Description" />
          <BiRow>
            <div className="space-y-1"><Lang lang="EN" /><TextBox value={events.description_en} onSave={v => save("website_events", { description_en: v })} allowHtml rows={3} /></div>
            <div className="space-y-1"><Lang lang="DE" /><TextBox value={events.description_de} onSave={v => save("website_events", { description_de: v })} allowHtml rows={3} /></div>
          </BiRow>
        </div>
        <div>
          <BiLabel label="Feature bullets" />
          <FeaturesEditor features={events.features} onSave={f => save("website_events", { features: f })} />
        </div>
      </SectionCard>

      {/* ── Hours ── */}
      <SectionCard title="Opening Hours & Seatings" description="Shown in the Contact section and FAQ">
        <HoursEditor
          opening={hours.opening}
          seatings={hours.seatings}
          onSave={(op, se) => save("website_hours", { opening: op, seatings: se })}
        />
      </SectionCard>

      {/* ── FAQ ── */}
      <SectionCard title="FAQ" description="Frequently asked questions — shown in EN and DE">
        <FAQEditor items={faq} onSave={items => save("website_faq", items)} />
      </SectionCard>

      {/* ── Press ── */}
      <SectionCard title="Press" description="Press mentions and quotes shown on the home page">
        <div>
          <BiLabel label="Press outlets" />
          <p className="text-xs text-gray-400 mb-2">Comma-separated list</p>
          <InlineText
            value={press.outlets.join(", ")}
            onSave={v => save("website_press", { outlets: v.split(",").map(s => s.trim()).filter(Boolean) })}
            className="text-sm"
          />
        </div>
        <div>
          <BiLabel label="Quotes" />
          <div className="space-y-3">
            {press.quotes.map((q, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Quote</label>
                  <TextBox
                    value={q.text}
                    onSave={async (v) => {
                      const updated = press.quotes.map((item, idx) => idx === i ? { ...item, text: v } : item);
                      await save("website_press", { quotes: updated });
                    }}
                    rows={2}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Source</label>
                  <InlineText
                    value={q.source}
                    onSave={async (v) => {
                      const updated = press.quotes.map((item, idx) => idx === i ? { ...item, source: v } : item);
                      await save("website_press", { quotes: updated });
                    }}
                    className="text-sm font-medium"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* ── Vouchers ── */}
      <SectionCard title="Gift Vouchers" description="Preset amounts shown on the home page slider">
        <div>
          <BiLabel label="Preset amounts (€)" />
          <p className="text-xs text-gray-400 mb-2">Comma-separated, e.g. 50, 100, 150, 200</p>
          <InlineText
            value={vouchers.amounts.join(", ")}
            onSave={v => save("website_vouchers", { amounts: v.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n)) })}
            className="text-sm font-mono"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <BiLabel label="Default amount (€)" />
            <InlineText
              value={String(vouchers.default_amount)}
              onSave={v => save("website_vouchers", { default_amount: parseInt(v) })}
              className="text-sm font-mono"
            />
          </div>
          <div>
            <BiLabel label="Validity (years)" />
            <InlineText
              value={String(vouchers.validity_years)}
              onSave={v => save("website_vouchers", { validity_years: parseInt(v) })}
              className="text-sm font-mono"
            />
          </div>
        </div>
      </SectionCard>

      {/* Gallery section note */}
      <SectionCard title="Gallery" description="Photo strip and section images">
        <p className="text-sm text-gray-500">Gallery images can be replaced by clicking on any image below.</p>
        <div>
          <BiLabel label="About photo" />
          <ImageField src={about.image} alt="About" onSave={v => save("website_about", { image: v })} aspectRatio="4/3" className="max-w-xs" />
        </div>
        <div>
          <BiLabel label="Private dining photo" />
          <ImageField src={gallery.private_dining} alt="Private dining" onSave={v => save("website_gallery", { private_dining: v })} aspectRatio="4/3" className="max-w-xs" />
        </div>
        <div>
          <BiLabel label="Photo strip (3 images)" />
          <div className="grid grid-cols-3 gap-3">
            {gallery.strip.map((img, i) => (
              <ImageField key={i} src={img.src} alt={img.alt} aspectRatio="4/3"
                onSave={async (url) => {
                  const updated = gallery.strip.map((s, idx) => idx === i ? { ...s, src: url } : s);
                  await save("website_gallery", { strip: updated });
                }}
              />
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Bottom publish bar */}
      <div className="sticky bottom-6 flex justify-end">
        <div className="bg-white border border-gray-200 shadow-lg rounded-2xl px-4 py-3 flex items-center gap-4">
          <span className="text-sm text-gray-500">Ready to go live?</span>
          <PublishButton />
        </div>
      </div>

    </div>
  );
}
