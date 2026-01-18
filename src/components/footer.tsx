export function Footer() {
  const year = new Date().getFullYear();
  return (
    <div class="appFooter">
      <div class="appFooterInner">Copyright © {year} | Proudly presented by Cuan Yuk!</div>
    </div>
  );
}
