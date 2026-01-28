import { useTheme, type ThemePreference } from "@/state/theme";

const isThemePreference = (v: string): v is ThemePreference =>
  v === "system" || v === "light" || v === "dark" || v === "black";

export function Header() {
  const theme = useTheme();
  return (
    <header class="appHeader">
      <div class="appHeaderInner">
        <div class="brand">
          <img class="brandLogo" src="/icon.ico" alt="Cuan Yuk! logo" />
          <div class="brandText">
            <div class="brandTitle">Cuan Yuk!</div>
            <div class="brandTagline">Act small, grow consistently!</div>
          </div>
        </div>

        <div class="appHeaderRight">
          <div class="headerControl">
            <div class="headerControlLabel">Theme</div>
            <select
              class="select"
              value={theme.preference()}
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (isThemePreference(v)) theme.setPreference(v);
              }}
              style="width: 150px"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="black">Black</option>
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}
