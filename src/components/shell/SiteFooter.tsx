import { BrandMark } from "@/components/ui/Icon";

/**
 * Slim single-row footer. Brand mark + "CoverFi Protocol" on the left,
 * mono "© 2026" on the right. No links, no hover effects, no i18n needed.
 * Stacks vertically (centered) on narrow viewports.
 */
export function SiteFooter() {
  return (
    <footer className="site">
      <div className="wrap">
        <div className="foot-in">
          <div className="foot-brand">
            <BrandMark size={20} />
            CoverFi <span className="fb-p">Protocol</span>
          </div>
          <span className="foot-copy">© 2026</span>
        </div>
      </div>
    </footer>
  );
}
