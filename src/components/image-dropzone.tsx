import { Show, createMemo, createSignal } from "solid-js";

const normalizeExt = (name: string) => {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i + 1).toLowerCase();
};

const formatExts = (exts: string[]) => exts.map((e) => e.toUpperCase()).join(" • ");

export function ImageDropzone(props: {
  id: string;
  label: string;
  required?: boolean;
  disabled?: boolean;
  file: File | null;
  setFile: (file: File | null) => void;
  supportedExts: string[];
  progress?: number | null;
  invalidToast: (message: string) => void;
}) {
  let inputEl: HTMLInputElement | undefined;
  const [dragOver, setDragOver] = createSignal(false);

  const supportedText = createMemo(() => formatExts(props.supportedExts));

  const validateAndSet = (file: File | null) => {
    if (!file) {
      props.setFile(null);
      if (inputEl) inputEl.value = "";
      return;
    }

    const ext = normalizeExt(file.name);
    const okExt = props.supportedExts.includes(ext);
    const okMime = file.type.startsWith("image/");
    if (!okExt || !okMime) {
      props.invalidToast("Invalid file extension.");
      props.setFile(null);
      if (inputEl) inputEl.value = "";
      return;
    }

    props.setFile(file);
  };

  return (
    <div class="dropzoneWrap">
      <input
        ref={(el) => {
          inputEl = el;
        }}
        id={props.id}
        type="file"
        accept={props.supportedExts.map((e) => `.${e}`).join(",")}
        style="display: none"
        disabled={props.disabled}
        onChange={(e) => validateAndSet(e.currentTarget.files?.[0] ?? null)}
      />

      <button
        classList={{
          dropzone: true,
          dropzoneActive: dragOver(),
          dropzoneDisabled: Boolean(props.disabled),
        }}
        type="button"
        disabled={props.disabled}
        onClick={() => inputEl?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (props.disabled) return;
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (props.disabled) return;
          validateAndSet(e.dataTransfer?.files?.[0] ?? null);
        }}
      >
        <div class="dropzoneInner">
          <div class="dropzoneTop">
            <div class="dropzoneLabel">
              {props.label}
              <Show when={props.required}>
                <span class="fieldReq">*</span>
              </Show>
            </div>
            <Show when={props.file}>
              <button
                class="dropzoneClear"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  validateAndSet(null);
                }}
                aria-label="Clear file"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <title>Remove</title>
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </Show>
          </div>

          <div class="dropzoneBody">
            <Show
              when={props.file}
              fallback={
                <div class="dropzoneHint">
                  <div class="dropzoneTitle">Drag & drop an image here</div>
                  <div class="dropzoneSub">PNG/JPG/GIF/WEBP • {supportedText()}</div>
                  <div class="dropzoneActions">
                    <button
                      class="dropzoneBrowseBtn"
                      type="button"
                      disabled={props.disabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        inputEl?.click();
                      }}
                    >
                      Browse files
                    </button>
                  </div>
                </div>
              }
            >
              <div class="dropzoneFile">
                <div class="dropzoneFileName">{props.file?.name}</div>
                <div class="dropzoneFileMeta">{supportedText()}</div>
                <div class="dropzoneActions">
                  <button
                    class="dropzoneBrowseBtn dropzoneBrowseBtnSecondary"
                    type="button"
                    disabled={props.disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      inputEl?.click();
                    }}
                  >
                    Change file
                  </button>
                </div>
              </div>
            </Show>
          </div>

          <Show when={typeof props.progress === "number"}>
            <div class="dropzoneProgress">
              <div
                class="dropzoneProgressBar"
                style={{ width: `${Math.max(0, Math.min(100, props.progress ?? 0))}%` }}
              />
            </div>
          </Show>
        </div>
      </button>
    </div>
  );
}
