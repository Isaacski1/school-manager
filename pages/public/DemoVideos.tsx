import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import PublicSiteLayout from "../../components/marketing/PublicSiteLayout";

const demoVideos = [
  { title: "Getting Started", desc: "Setting up your school profile, academic year, and initial configuration.", duration: "3:45", category: "Setup", file: "getting-started.mp4" },
  { title: "Student Management", desc: "How to add students, manage classes, and track student history.", duration: "5:20", category: "Records", file: "students.mp4" },
  { title: "Attendance Tracking", desc: "Daily attendance recording for students and staff with real-time alerts.", duration: "4:10", category: "Operations", file: "attendance.mp4" },
  { title: "Assessments & Reports", desc: "Entering marks, calculating positions, and generating report cards.", duration: "8:15", category: "Academic", file: "reports.mp4" },
  { title: "Fees & Payments", desc: "Setting up fees, recording payments, and generating PDF receipts.", duration: "6:40", category: "Finance", file: "finance.mp4" },
  { title: "WhatsApp Broadcasts", desc: "Connecting your device and sending bulk messages to parents.", duration: "4:50", category: "Communication", file: "whatsapp.mp4" },
];

const DemoVideos = () => {
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  return (
    <PublicSiteLayout>
      <style>{`
        @media (max-width: 640px) {
          .demo-video-grid { grid-template-columns: 1fr !important; gap: 20px !important; }
          .demo-video-header { padding: 64px 24px 48px !important; }
          .demo-video-section { padding: 0 20px 80px !important; }
        }
      `}</style>

      <section className="demo-video-header" style={{ background: "transparent", padding: "80px 24px 64px" }}>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.65)", margin: "0 0 12px 0" }}>Watch Demos</p>
          <h1 style={{ fontSize: "clamp(30px, 5vw, 48px)", fontWeight: 800, color: "white", margin: "0 0 16px 0", lineHeight: 1.15 }}>Explore School Manager GH in action</h1>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.75)", margin: 0, lineHeight: 1.7 }}>Watch quick walkthroughs of the core workflows schools use for setup, records, attendance, reports, fees, and parent communication.</p>
        </motion.div>
      </section>

      <section className="demo-video-section" style={{ padding: "0 24px 96px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div className="demo-video-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 32 }}>
            {demoVideos.map((video, idx) => (
              <motion.div
                key={video.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.06 }}
                onClick={() => setSelectedVideo(video.file)}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 24,
                  border: "1.5px solid rgba(255,255,255,0.08)",
                  overflow: "hidden",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-8px)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(147, 197, 253, 0.3)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
              >
                <div style={{ height: 180, background: "rgba(11,74,130,0.4)", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ position: "absolute", inset: 0, opacity: 0.3, background: "url(https://images.unsplash.com/photo-1501504905252-473c47e087f8?auto=format&fit=crop&q=80&w=400) center/cover" }} />
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(0,0,0,0.3)", zIndex: 1 }}>
                    <div style={{ width: 0, height: 0, borderTop: "10px solid transparent", borderBottom: "10px solid transparent", borderLeft: "15px solid #0B4A82", marginLeft: 4 }} />
                  </div>
                  <div style={{ position: "absolute", bottom: 12, right: 12, background: "rgba(0,0,0,0.6)", padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, color: "white" }}>
                    {video.duration}
                  </div>
                  <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(147, 197, 253, 0.2)", backdropFilter: "blur(4px)", padding: "4px 10px", borderRadius: 99, fontSize: 10, fontWeight: 700, color: "#93C5FD", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {video.category}
                  </div>
                </div>

                <div style={{ padding: 24 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: "white", margin: "0 0 8px 0" }}>{video.title}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.6)", margin: "0 0 20px 0" }}>{video.desc}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#93C5FD", fontSize: 14, fontWeight: 600 }}>
                    Watch Tutorial <ArrowRight size={14} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <AnimatePresence>
        {selectedVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedVideo(null)}
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 9999,
              display: "flex", alignItems: "center", justifyContent: "center", padding: 24
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 1000, width: "100%", position: "relative" }}
            >
              <button
                onClick={() => setSelectedVideo(null)}
                style={{ position: "absolute", top: -48, right: 0, color: "white", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}
              >
                Close <X size={24} />
              </button>
              <div style={{ borderRadius: 24, overflow: "hidden", background: "black", boxShadow: "0 24px 64px rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <video
                  src={`/videos/${selectedVideo}`}
                  controls
                  autoPlay
                  style={{ width: "100%", display: "block" }}
                >
                  Your browser does not support the video tag.
                </video>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PublicSiteLayout>
  );
};

export default DemoVideos;
