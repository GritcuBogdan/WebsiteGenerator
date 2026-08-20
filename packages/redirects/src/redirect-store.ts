// The Worker serving /go/<slug> reads slug -> affiliateUrl from here.
export interface RedirectStore {
  setRedirect(slug: string, affiliateUrl: string): Promise<void>;
  getRedirect(slug: string): Promise<string | null>;
}
