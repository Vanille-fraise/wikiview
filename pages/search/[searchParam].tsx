import FlowProvider from "@/code/types/Flow";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

const DEFAULT_PAGE = "test";

export function ViewPage({ pageName }: { pageName: string }) {
  const [page, setPage] = useState<string>(pageName);

  useEffect(() => {
    setPage(pageName);
  }, [pageName]);

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <FlowProvider page={page} setPage={setPage}></FlowProvider>
    </div>
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
        console.log("Router is ready. Setting page to:", searchParam);
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
