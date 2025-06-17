import { interpolateColor } from "@/code/lib/utils";
import { BREAKDOWN_COLOR, HYPER_COLOR } from "@/code/lib/variables";
import { FilterPanel } from "@/code/types/FilterPanel";
import FlowProvider from "@/code/types/Flow";
import { ShowFilterButton } from "@/code/types/ShowFilterButton";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

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
  { progress: 0.94, duration: 1 },
  { progress: 1, duration: 0.2 },
  { progress: 1, duration: 0.2 },
];

export enum LoadingStatus {
  Start,
  Error,
  Done,
}

export function ViewPage({ pageName }: { pageName: string }) {
  const [page, setPage] = useState<string>(pageName);
  const [loadingProgress, setloadingProgress] = useState(0);
  const [loadingColor, setLoadingColor] = useState("transparent");
  const [loadingDuration, setLoadingDuration] = useState(0);
  const [startLoading, setStartLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<LoadingStatus>(
    LoadingStatus.Done
  );

  const loadingStatusRef = useRef(loadingStatus);
  useEffect(() => {
    loadingStatusRef.current = loadingStatus;
  }, [loadingStatus]);

  useEffect(() => {
    if (!startLoading) {
      return;
    }
    const startLoadingFunc = async () => {
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
      if (loadingStatusRef.current == LoadingStatus.Done) {
        setLoadingColor("transparent");
      } else if (loadingStatusRef.current == LoadingStatus.Start) {
        for (var i = 0; i < 40; i++) {
          if (loadingStatusRef.current != LoadingStatus.Start) break;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        setLoadingColor("transparent");
      }
      if (loadingStatusRef.current == LoadingStatus.Error) {
        setLoadingColor("red");
        await new Promise((resolve) => setTimeout(resolve, 3000));
        setloadingProgress(0);
        await new Promise((resolve) => setTimeout(resolve, 200));
        setLoadingColor("transparent");
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
      setLoadingDuration(0);
      setloadingProgress(0);
      await new Promise((resolve) => setTimeout(resolve, 100));
      setLoadingStatus(LoadingStatus.Done);
      setStartLoading(false);
    };
    startLoadingFunc();
  }, [startLoading]);

  useEffect(() => {
    setPage(pageName);
  }, [pageName]);

  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [filterList, setFilterList] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

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
      {isPanelVisible ? (
        <FilterPanel
          filterList={filterList}
          activeFilters={activeFilters}
          onHide={() => setIsPanelVisible(false)}
          onApply={(newFilters) => {
            setActiveFilters(newFilters);
          }}
        />
      ) : (
        <ShowFilterButton onClick={() => setIsPanelVisible(true)} />
      )}
      <div style={{ width: "100vw", height: "100vh" }}>
        <FlowProvider
          page={page}
          setPage={setPage}
          setLoadingStatus={setLoadingStatus}
          setStartLoading={setStartLoading}
          setFilterList={setFilterList}
          activeFilters={activeFilters}
          setActiveFilters={setActiveFilters}
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
