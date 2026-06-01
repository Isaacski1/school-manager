import React from "react";
import { motion } from "framer-motion";
import PublicSiteLayout from "../../components/marketing/PublicSiteLayout";

const DemoVideos = () => {
  return (
    <PublicSiteLayout>
      <style>{`
        @media (max-width: 640px) {
          .demo-video-header { padding: 64px 22px 36px !important; }
          .demo-video-section { padding: 0 18px 80px !important; }
        }
      `}</style>

      <section className="demo-video-header" style={{ background: "transparent", padding: "80px 24px 52px" }}>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} style={{ maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.65)", margin: "0 0 12px 0" }}>Coming Soon</p>
          <h1 style={{ fontSize: "clamp(30px, 5vw, 52px)", fontWeight: 900, color: "white", margin: "0 0 16px 0", lineHeight: 1.12 }}>Demo Videos Coming Soon</h1>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.75)", margin: "0 auto", lineHeight: 1.7, maxWidth: 760 }}>
            We're recording demo videos to show you exactly how School Manager GH works. Check back soon to see walkthroughs for administration, fees, attendance, academics, communication, and more.
          </p>
        </motion.div>
      </section>

      <section className="demo-video-section" style={{ padding: "0 24px 96px" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", textAlign: "center" }}>
          <div style={{
            marginBottom: 34,
            border: "1px solid rgba(147,197,253,0.16)",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 22,
            padding: 32,
          }}>
            <p style={{ margin: "0 0 8px", color: "#93C5FD", fontSize: 12, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase" }}>
              In the meantime
            </p>
            <p style={{ margin: "0 0 16px", color: "rgba(255,255,255,0.72)", lineHeight: 1.7, fontSize: 16 }}>
              Want to learn more about School Manager GH? Visit our <a href="/features" style={{ color: "#93C5FD", textDecoration: "none", fontWeight: 600 }}>features page</a> or <a href="/book-demo" style={{ color: "#93C5FD", textDecoration: "none", fontWeight: 600 }}>book a live demo</a> with our team.
            </p>
          </div>
        </div>
      </section>
    </PublicSiteLayout>
  );
};

export default DemoVideos;
