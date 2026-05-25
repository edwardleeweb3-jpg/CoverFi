"use client";

import { useState } from "react";
import { useT } from "@/hooks/useT";
import { useInView } from "@/hooks/useInView";

/**
 * Accordion FAQ section. Clicking a question toggles its `.open` class;
 * CSS animates the `+` glyph to rotate to "×" and the answer panel to
 * slide open via max-height. Only one item open at a time.
 */
export function FAQ() {
  const t = useT();
  const { ref, inView } = useInView<HTMLElement>();
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <section
      ref={ref}
      className={`block reveal${inView ? " seen" : ""}`}
      id="faq"
    >
      <div className="wrap">
        <p className="lbl">{t.faq}</p>
        <h2 className="h2" style={{ marginBottom: 24 }}>
          {t.commonQ}
        </h2>

        <div className="faqwrap">
          {t.faqs.map(([q, a], i) => (
            <div
              key={i}
              className={`faq-item${openIdx === i ? " open" : ""}`}
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
            >
              <div className="q">
                {q}
                <span className="pm">+</span>
              </div>
              <div className="ans">
                <div className="ans-in">{a}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
