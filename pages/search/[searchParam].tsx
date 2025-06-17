import { interpolateColor } from "@/code/lib/utils";
import { BREAKDOWN_COLOR, HYPER_COLOR } from "@/code/lib/variables";
import FlowProvider from "@/code/types/Flow";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

interface LoadingState {
  progress: number;
  duration: number;
}

const DEFAULT_PAGE = "test";

const LOADING_START_COLOR = "#7ef4cc";
const LOADING_END_COLOR = BREAKDOWN_COLOR;

const LOADING_STEPS: LoadingState[] = [
  { progress: 0, duration: 0 },
  { progress: 0.1, duration: 1 },
  { progress: 0.94, duration: 1.2 },
  { progress: 1, duration: 0.2 },
  { progress: 1, duration: 0.2 },
];

export function ViewPage({ pageName }: { pageName: string }) {
  const [page, setPage] = useState<string>(pageName);
  const [loadingProgress, setloadingProgress] = useState(0);
  const [loadingColor, setLoadingColor] = useState("transparent");
  const [loadingDuration, setLoadingDuration] = useState(0);
  const [startLoading, setStartLoading] = useState(false);

  useEffect(() => {
    const startLoadingFunc = async () => {
      if (!startLoading) {
        return;
      }
      for (const step of LOADING_STEPS) {
        setLoadingDuration(step.duration);
        setloadingProgress(step.progress);
        setLoadingColor(
          interpolateColor(
            LOADING_START_COLOR,
            LOADING_END_COLOR,
            step.progress
          )
        );
        if (step.duration > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, step.duration * 1000)
          );
        }
      }
      setLoadingColor("transparent");
      await new Promise((resolve) => setTimeout(resolve, 200));
      setLoadingDuration(0);
      setloadingProgress(0);
      await new Promise((resolve) => setTimeout(resolve, 100));
      setStartLoading(false);
    };
    startLoadingFunc();
  }, [startLoading]);

  useEffect(() => {
    setPage(pageName);
  }, [pageName]);

  return (
    <>
      <div
        style={{
          width: "100vw",
          height: "4px",
          position: "fixed",
          top: "0",
          left: "0",
          zIndex: 1000,
        }}
      >
        <div
          style={{
            width: `${loadingProgress * 100}%`,
            backgroundColor: loadingColor,
            transition: `width ${loadingDuration}s ease-in-out, background-color ${loadingDuration}s ease-in-out`,
            height: "100%",
          }}
        ></div>
      </div>
      <div style={{ width: "100vw", height: "100vh" }}>
        <FlowProvider
          page={page}
          setPage={setPage}
          setStartLoading={setStartLoading}
        ></FlowProvider>
      </div>
    </>
  );
}

export default function ParamSearchApp() {
  const router = useRouter();
  const [searchPage, setSearchPage] = useState<string>("");

  useEffect(() => {
    if (router.isReady) {
      const { searchParam } = router.query;
      if (typeof searchParam === "string" && searchParam.length > 0) {
        setSearchPage(searchParam);
      } else {
        console.log(
          "Router is ready, but searchParam is invalid. Using default."
        );
        setSearchPage(DEFAULT_PAGE);
      }
    }
  }, [router.isReady, router.query]);
  return <ViewPage pageName={searchPage} />;
}
