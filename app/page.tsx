"use client";

import JSZip from "jszip";
import zeabur from "@/libs/zeabur";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { useScrollTo } from "@/hooks/use-scroll-to";
import { Sandpack } from "@codesandbox/sandpack-react";
import { dracula as draculaTheme } from "@codesandbox/sandpack-themes";
import { CheckIcon } from "@heroicons/react/16/solid";
import {
  ArrowLongRightIcon,
  ChevronDownIcon,
  PlusIcon,
} from "@heroicons/react/20/solid";
import * as Select from "@radix-ui/react-select";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  createParser,
  ParsedEvent,
  ReconnectInterval,
} from "eventsource-parser";
import { AnimatePresence, motion } from "framer-motion";
import { FormEvent, useEffect, useState } from "react";
import LoadingDots from "../components/loading-dots";

export default function Home() {
  let [status, setStatus] = useState<
    "initial" | "creating" | "created" | "updating" | "updated"
  >("initial");
  let [generatedCode, setGeneratedCode] = useState("");
  let [modelUsedForInitialCode, setModelUsedForInitialCode] = useState("");
  let [ref, scrollTo] = useScrollTo();
  let [messages, setMessages] = useState<{ role: string; content: string }[]>(
    [],
  );

  let loading = status === "creating" || status === "updating";

  async function generateCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (status !== "initial") {
      scrollTo({ delay: 0.5 });
    }

    setStatus("creating");
    setGeneratedCode("");

    let formData = new FormData(e.currentTarget);
    let model = formData.get("model");
    let prompt = formData.get("prompt");
    if (typeof prompt !== "string" || typeof model !== "string") {
      return;
    }
    let newMessages = [{ role: "user", content: prompt }];

    const chatRes = await fetch("/api/generateCode", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: newMessages,
        model,
      }),
    });
    if (!chatRes.ok) {
      throw new Error(chatRes.statusText);
    }

    // This data is a ReadableStream
    const data = chatRes.body;
    if (!data) {
      return;
    }
    const onParse = (event: ParsedEvent | ReconnectInterval) => {
      if (event.type === "event") {
        const data = event.data;
        try {
          const text = JSON.parse(data).text ?? "";
          setGeneratedCode((prev) => prev + text);
        } catch (e) {
          console.error(e);
        }
      }
    };

    // https://web.dev/streams/#the-getreader-and-read-methods
    const reader = data.getReader();
    const decoder = new TextDecoder();
    const parser = createParser(onParse);
    let done = false;

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      const chunkValue = decoder.decode(value);
      parser.feed(chunkValue);
    }

    newMessages = [
      ...newMessages,
      { role: "assistant", content: generatedCode },
    ];

    setModelUsedForInitialCode(model);
    setMessages(newMessages);
    setStatus("created");
  }

  async function modifyCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setStatus("updating");

    let formData = new FormData(e.currentTarget);
    let prompt = formData.get("prompt");
    if (typeof prompt !== "string") {
      return;
    }
    let newMessages = [...messages, { role: "user", content: prompt }];

    setGeneratedCode("");
    const chatRes = await fetch("/api/generateCode", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: newMessages,
        model: modelUsedForInitialCode,
      }),
    });
    if (!chatRes.ok) {
      throw new Error(chatRes.statusText);
    }

    // This data is a ReadableStream
    const data = chatRes.body;
    if (!data) {
      return;
    }
    const onParse = (event: ParsedEvent | ReconnectInterval) => {
      if (event.type === "event") {
        const data = event.data;
        try {
          const text = JSON.parse(data).text ?? "";
          setGeneratedCode((prev) => prev + text);
        } catch (e) {
          console.error(e);
        }
      }
    };

    // https://web.dev/streams/#the-getreader-and-read-methods
    const reader = data.getReader();
    const decoder = new TextDecoder();
    const parser = createParser(onParse);
    let done = false;

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      const chunkValue = decoder.decode(value);
      parser.feed(chunkValue);
    }

    newMessages = [
      ...newMessages,
      { role: "assistant", content: generatedCode },
    ];

    setMessages(newMessages);
    setStatus("updated");
  }

  useEffect(() => {
    let el = document.querySelector(".cm-scroller");
    if (el && loading) {
      let end = el.scrollHeight - el.clientHeight;
      el.scrollTo({ top: end });
    }
  }, [loading, generatedCode]);

  const [isDeploying, setIsDeploying] = useState(false);
  const [domain, setDomain] = useState("");

  async function composeFilesToZip() {
    const zip = new JSZip();

    const tsconfigJson = {
      files: [],
      references: [
        {
          path: "./tsconfig.app.json",
        },
        {
          path: "./tsconfig.node.json",
        },
      ],
    };

    const tsconfigAppJson = {
      compilerOptions: {
        composite: true,
        tsBuildInfoFile: "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
        target: "ES2020",
        useDefineForClassFields: true,
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,

        /* Bundler mode */
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        moduleDetection: "force",
        noEmit: true,
        jsx: "react-jsx",

        /* Linting */
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
      },
      include: ["src"],
    };

    const tsconfigNodeJson = {
      compilerOptions: {
        composite: true,
        tsBuildInfoFile: "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
        skipLibCheck: true,
        module: "ESNext",
        moduleResolution: "bundler",
        allowSyntheticDefaultImports: true,
        strict: true,
        noEmit: true,
      },
      include: ["vite.config.ts"],
    };

    const packageJson = {
      name: "vite-template",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc -b && vite build",
        lint: "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
        preview: "vite preview",
      },
      dependencies: {
        react: "^18.3.1",
        "react-dom": "^18.3.1",
      },
      devDependencies: {
        "@types/react": "^18.3.3",
        "@types/react-dom": "^18.3.0",
        "@typescript-eslint/eslint-plugin": "^7.15.0",
        "@typescript-eslint/parser": "^7.15.0",
        "@vitejs/plugin-react": "^4.3.1",
        eslint: "^8.57.0",
        "eslint-plugin-react-hooks": "^4.6.2",
        "eslint-plugin-react-refresh": "^0.4.7",
        typescript: "^5.2.2",
        vite: "^5.3.4",
      },
    };

    const viteConfigTs = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
})
`;

    const indexHTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React + TS</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

    const mainTsx = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`;

    zip.file("/tsconfig.json", JSON.stringify(tsconfigJson, null, 2));
    zip.file("/tsconfig.app.json", JSON.stringify(tsconfigAppJson, null, 2));
    zip.file("/tsconfig.node.json", JSON.stringify(tsconfigNodeJson, null, 2));
    zip.file("/package.json", JSON.stringify(packageJson, null, 2));
    zip.file("/index.html", indexHTML);
    zip.file("/vite.config.ts", viteConfigTs);
    zip.file("/src/main.tsx", mainTsx);
    zip.file("/src/App.tsx", generatedCode);

    return zip.generateAsync({ type: "blob" });
  }

  async function deployToZeabur() {
    const zip = await composeFilesToZip();

    // Debug Only
    // // Create a Blob from the zip file
    // const zipBlob = new Blob([zip], { type: "application/zip" });

    // // Create a temporary URL for the Blob
    // const zipUrl = URL.createObjectURL(zipBlob);

    // // Create a temporary anchor element
    // const downloadLink = document.createElement("a");
    // downloadLink.href = zipUrl;
    // downloadLink.download = "project.zip";

    // // Append to the body, click, and remove
    // document.body.appendChild(downloadLink);
    // downloadLink.click();
    // document.body.removeChild(downloadLink);

    // // Clean up the temporary URL
    // URL.revokeObjectURL(zipUrl);

    setIsDeploying(true);
    try {
      const res = await zeabur.deploy(zip, "hkg1", "llamacoder", true);
      setDomain(res);
      window.open("https://" + res, "_blank");
    } catch (error) {
      console.error(error);
    } finally {
      setIsDeploying(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center py-2">
      <Header />

      <main className="mt-12 flex w-full flex-1 flex-col items-center px-4 text-center sm:mt-20">
        <a
          className="mb-4 inline-flex h-7 shrink-0 items-center gap-[9px] rounded-[50px] border-[0.5px] border-solid border-[#E6E6E6] bg-[rgba(234,238,255,0.65)] bg-gray-100 px-7 py-5 shadow-[0px_1px_1px_0px_rgba(0,0,0,0.25)]"
          href="https://dub.sh/together-ai"
          target="_blank"
        >
          <span className="text-center">
            Powered by <span className="font-medium">Llama 3.1</span> and{" "}
            <span className="font-medium">Together AI</span>
          </span>
        </a>
        <h1 className="my-6 max-w-3xl text-4xl font-bold text-gray-800 sm:text-6xl">
          Turn your <span className="text-blue-600">idea</span>
          <br /> into an <span className="text-blue-600">app</span>
        </h1>

        <form className="w-full max-w-xl" onSubmit={generateCode}>
          <fieldset disabled={loading} className="disabled:opacity-75">
            <div className="relative mt-5">
              <div className="absolute -inset-2 rounded-[32px] bg-gray-300/50" />
              <div className="relative flex rounded-3xl bg-white shadow-sm">
                <div className="relative flex flex-grow items-stretch focus-within:z-10">
                  <input
                    required
                    name="prompt"
                    className="w-full rounded-l-3xl bg-transparent px-6 py-5 text-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                    placeholder="Build me a calculator app..."
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="relative -ml-px inline-flex items-center gap-x-1.5 rounded-r-3xl px-3 py-2 text-sm font-semibold text-blue-500 hover:text-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:text-gray-900"
                >
                  {status === "creating" ? (
                    <LoadingDots color="black" style="large" />
                  ) : (
                    <ArrowLongRightIcon className="-ml-0.5 size-6" />
                  )}
                </button>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-center gap-3">
              <p className="text-xs text-gray-500">Model:</p>
              <Select.Root
                name="model"
                defaultValue="meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo"
                disabled={loading}
              >
                <Select.Trigger className="group flex w-full max-w-xs items-center rounded-2xl border-[6px] border-gray-300 bg-white px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
                  <Select.Value />
                  <Select.Icon className="ml-auto">
                    <ChevronDownIcon className="size-6 text-gray-300 group-focus-visible:text-gray-500 group-enabled:group-hover:text-gray-500" />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="overflow-hidden rounded-md bg-white shadow-lg">
                    <Select.Viewport className="p-2">
                      {[
                        {
                          label: "Llama 3.1 405B",
                          value:
                            "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
                        },
                        {
                          label: "Llama 3.1 70B",
                          value: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
                        },
                        {
                          label: "Gemma 2 27B",
                          value: "google/gemma-2-27b-it",
                        },
                      ].map((model) => (
                        <Select.Item
                          key={model.value}
                          value={model.value}
                          className="flex cursor-pointer items-center rounded-md px-3 py-2 text-sm data-[highlighted]:bg-gray-100 data-[highlighted]:outline-none"
                        >
                          <Select.ItemText asChild>
                            <span className="inline-flex items-center gap-2 text-gray-500">
                              <div className="size-2 rounded-full bg-green-500" />
                              {model.label}
                            </span>
                          </Select.ItemText>
                          <Select.ItemIndicator className="ml-auto">
                            <CheckIcon className="size-5 text-blue-600" />
                          </Select.ItemIndicator>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                    <Select.ScrollDownButton />
                    <Select.Arrow />
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>
          </fieldset>
        </form>

        <hr className="border-1 mb-20 h-px bg-gray-700 dark:bg-gray-700" />

        {status !== "initial" && (
          <motion.div
            initial={{ height: 0 }}
            animate={{
              height: "auto",
              overflow: "hidden",
              transitionEnd: { overflow: "visible" },
            }}
            transition={{ type: "spring", bounce: 0, duration: 0.5 }}
            className="w-full pb-[25vh] pt-10"
            onAnimationComplete={() => scrollTo()}
            ref={ref}
          >
            <div className="mt-5 flex gap-4">
              <form className="w-full" onSubmit={modifyCode}>
                <fieldset disabled={loading} className="group">
                  <div className="relative">
                    <div className="relative flex rounded-3xl bg-white shadow-sm group-disabled:bg-gray-50">
                      <div className="relative flex flex-grow items-stretch focus-within:z-10">
                        <input
                          required
                          name="prompt"
                          className="w-full rounded-l-3xl bg-transparent px-6 py-5 text-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed"
                          placeholder="Make changes to your app here"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="relative -ml-px inline-flex items-center gap-x-1.5 rounded-r-3xl px-3 py-2 text-sm font-semibold text-blue-500 hover:text-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:text-gray-900"
                      >
                        {loading ? (
                          <LoadingDots color="black" style="large" />
                        ) : (
                          <ArrowLongRightIcon className="-ml-0.5 size-6" />
                        )}
                      </button>
                    </div>
                  </div>
                </fieldset>
              </form>
              <div>
                <Tooltip.Provider>
                  <Tooltip.Root delayDuration={0}>
                    <Tooltip.Trigger asChild>
                      <button
                        onClick={() => {
                          location.reload();
                        }}
                        className="inline-flex size-[68px] items-center justify-center rounded-3xl bg-blue-500"
                      >
                        <PlusIcon className="size-10 text-white" />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        className="select-none rounded bg-white px-4 py-2.5 text-sm leading-none shadow-md shadow-black/20"
                        sideOffset={5}
                      >
                        Create a new app
                        <Tooltip.Arrow className="fill-white" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                </Tooltip.Provider>
              </div>
            </div>
            <div className="relative mt-8 w-full overflow-hidden">
              <div className="isolate">
                <Sandpack
                  theme={draculaTheme}
                  options={{
                    showNavigator: true,
                    externalResources: [
                      "https://unpkg.com/@tailwindcss/ui/dist/tailwind-ui.min.css",
                    ],
                    editorHeight: "80vh",
                    showTabs: false,
                  }}
                  files={{
                    "App.tsx": generatedCode,
                    "/public/index.html": `<!DOCTYPE html>
                    <html lang="en">
                      <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Document</title>
                        <script src="https://cdn.tailwindcss.com"></script>
                      </head>
                      <body>
                        <div id="root"></div>
                      </body>
                    </html>`,
                  }}
                  template="react-ts"
                  customSetup={{
                    dependencies: {
                      "lucide-react": "latest",
                      recharts: "2.9.0",
                    },
                  }}
                />

                <button
                  className={`absolute bottom-4 right-4 z-[9999] font-semibold ${
                    isDeploying ? "animate-pulse cursor-not-allowed" : ""
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    deployToZeabur();
                  }}
                >
                  <img
                    src="https://zeabur.com/button.svg"
                    alt="Deploy to Zeabur"
                    className="h-full w-full"
                  />
                </button>
              </div>

              <AnimatePresence>
                {loading && (
                  <motion.div
                    initial={status === "updating" ? { x: "100%" } : undefined}
                    animate={status === "updating" ? { x: "0%" } : undefined}
                    exit={{ x: "100%" }}
                    transition={{
                      type: "spring",
                      bounce: 0,
                      duration: 0.85,
                      delay: 0.5,
                    }}
                    className="absolute inset-x-0 bottom-0 top-1/2 flex items-center justify-center rounded-r border border-gray-400 bg-gradient-to-br from-gray-100 to-gray-300 md:inset-y-0 md:left-1/2 md:right-0"
                  >
                    <p className="animate-pulse text-3xl font-bold">
                      {status === "creating"
                        ? "Building your app..."
                        : "Updating your app..."}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </main>
      <Footer />
    </div>
  );
}
