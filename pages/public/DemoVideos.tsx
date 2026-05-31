import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  BadgeDollarSign,
  BookOpenCheck,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  MessageSquare,
  PlayCircle,
  Settings,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import PublicSiteLayout from "../../components/marketing/PublicSiteLayout";

type DemoVideo = {
  title: string;
  desc: string;
  duration: string;
  audience: string;
  category: string;
  file: string;
  icon: React.ElementType;
};

type DemoGroup = {
  title: string;
  desc: string;
  videos: DemoVideo[];
};

const demoGroups: DemoGroup[] = [
  {
    title: "Start Here",
    desc: "A quick introduction for schools that want to understand the platform before exploring specific workflows.",
    videos: [
      {
        title: "Platform Overview",
        desc: "A short tour of what School Manager GH does and who uses it.",
        duration: "3-4 min",
        audience: "School owners",
        category: "Overview",
        file: "platform-overview.mp4",
        icon: LayoutDashboard,
      },
      {
        title: "Admin Dashboard Overview",
        desc: "Show the daily control center for a school administrator.",
        duration: "4-5 min",
        audience: "School admins",
        category: "Admin",
        file: "admin-dashboard.mp4",
        icon: Settings,
      },
    ],
  },
  {
    title: "School Administration",
    desc: "Walkthroughs for the everyday work schools handle across student records, attendance, and parent communication.",
    videos: [
      {
        title: "Student & Parent Records",
        desc: "How to create student profiles and keep parent contacts ready for communication.",
        duration: "4-5 min",
        audience: "Admins",
        category: "Records",
        file: "student-parent-records.mp4",
        icon: Users,
      },
      {
        title: "Attendance Tracking",
        desc: "Daily attendance recording and review for school operations.",
        duration: "3-4 min",
        audience: "Admins and teachers",
        category: "Operations",
        file: "attendance-tracking.mp4",
        icon: ClipboardCheck,
      },
      {
        title: "SMS & Parent Communication",
        desc: "How schools top up SMS balance and send reminders to parents.",
        duration: "4-5 min",
        audience: "Admins",
        category: "Communication",
        file: "sms-parent-communication.mp4",
        icon: MessageSquare,
      },
    ],
  },
  {
    title: "Finance & Academics",
    desc: "Focused demos for fee management, payment tracking, assessments, and report card preparation.",
    videos: [
      {
        title: "Fees & Payments",
        desc: "Set up fees, record payments, track balances, and issue receipts.",
        duration: "5-7 min",
        audience: "Admins and bursars",
        category: "Finance",
        file: "fees-payments.mp4",
        icon: BadgeDollarSign,
      },
      {
        title: "Assessments & Report Cards",
        desc: "Enter marks, calculate positions, and produce report cards.",
        duration: "5-8 min",
        audience: "Admins and teachers",
        category: "Academics",
        file: "assessments-report-cards.mp4",
        icon: BookOpenCheck,
      },
    ],
  },
  {
    title: "User Portals",
    desc: "Short tours for the people who use the system outside the main school administration office.",
    videos: [
      {
        title: "Teacher Portal Overview",
        desc: "A teacher-focused walkthrough of classes, attendance, and academic work.",
        duration: "3-5 min",
        audience: "Teachers",
        category: "Teacher",
        file: "teacher-portal.mp4",
        icon: GraduationCap,
      },
      {
        title: "Parent Portal Overview",
        desc: "Show parents how they view fees, notices, reports, and child updates.",
        duration: "3-4 min",
        audience: "Parents",
        category: "Parent",
        file: "parent-portal.mp4",
        icon: UserRoundCheck,
      },
    ],
  },
];

const DemoVideos = () => {
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  return (
    <PublicSiteLayout>
      <style>{`
        .demo-groups { display: grid; gap: 34px; }
        .demo-video-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; }
        .demo-video-card:hover { transform: translateY(-6px); border-color: rgba(147, 197, 253, 0.32) !important; background: rgba(255,255,255,0.055) !important; }
        @media (max-width: 640px) {
          .demo-video-header { padding: 64px 22px 36px !important; }
          .demo-video-section { padding: 0 18px 80px !important; }
          .demo-video-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <section className="demo-video-header" style={{ background: "transparent", padding: "80px 24px 52px" }}>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} style={{ maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.65)", margin: "0 0 12px 0" }}>Watch Demos</p>
          <h1 style={{ fontSize: "clamp(30px, 5vw, 52px)", fontWeight: 900, color: "white", margin: "0 0 16px 0", lineHeight: 1.12 }}>Watch School Manager GH in action</h1>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.75)", margin: "0 auto", lineHeight: 1.7, maxWidth: 760 }}>
            Choose a short walkthrough based on what you want to see: administration, fees, attendance, academics, communication, teacher tools, or the parent portal.
          </p>
        </motion.div>
      </section>

      <section className="demo-video-section" style={{ padding: "0 24px 96px" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto" }}>
          <div style={{
            marginBottom: 34,
            border: "1px solid rgba(147,197,253,0.16)",
            background: "rgba(255,255,255,0.04)",
            borderRadius: 22,
            padding: 22,
          }}>
            <p style={{ margin: "0 0 8px", color: "#93C5FD", fontSize: 12, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase" }}>
              Start with the overview
            </p>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.72)", lineHeight: 1.7, fontSize: 14 }}>
              New to School Manager GH? Watch the platform overview first, then explore the workflow that matters most to your school.
            </p>
          </div>

          <div className="demo-groups">
            {demoGroups.map((group, groupIndex) => (
              <motion.div
                key={group.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: groupIndex * 0.05 }}
              >
                <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
                  <div>
                    <h2 style={{ color: "white", fontSize: 24, fontWeight: 850, margin: "0 0 6px" }}>{group.title}</h2>
                    <p style={{ color: "rgba(255,255,255,0.62)", fontSize: 14, lineHeight: 1.6, margin: 0, maxWidth: 720 }}>{group.desc}</p>
                  </div>
                  <span style={{ color: "#93C5FD", fontSize: 12, fontWeight: 800, background: "rgba(147,197,253,0.12)", border: "1px solid rgba(147,197,253,0.18)", borderRadius: 999, padding: "7px 11px" }}>
                    {group.videos.length} video{group.videos.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="demo-video-grid">
                  {group.videos.map((video) => {
                    const Icon = video.icon;
                    return (
                      <button
                        key={video.title}
                        type="button"
                        className="demo-video-card"
                        onClick={() => setSelectedVideo(video.file)}
                        style={{
                          textAlign: "left",
                          background: "rgba(255,255,255,0.035)",
                          borderRadius: 22,
                          border: "1.5px solid rgba(255,255,255,0.08)",
                          overflow: "hidden",
                          cursor: "pointer",
                          transition: "all 0.25s ease",
                          padding: 0,
                          color: "inherit",
                        }}
                      >
                        <div style={{ minHeight: 148, background: "rgba(11,74,130,0.35)", position: "relative", padding: 18, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                          <div style={{ position: "absolute", inset: 0, opacity: 0.22, background: "url(/img-school.png) center/cover" }} />
                          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <span style={{ background: "rgba(147, 197, 253, 0.18)", backdropFilter: "blur(4px)", padding: "5px 10px", borderRadius: 999, fontSize: 10, fontWeight: 800, color: "#BFDBFE", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                              {video.category}
                            </span>
                            <span style={{ background: "rgba(0,0,0,0.48)", padding: "5px 9px", borderRadius: 8, fontSize: 11, fontWeight: 800, color: "white" }}>
                              {video.duration}
                            </span>
                          </div>
                          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
                            <div style={{ width: 46, height: 46, borderRadius: 14, background: "rgba(255,255,255,0.12)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.14)" }}>
                              <Icon size={22} />
                            </div>
                            <PlayCircle size={48} color="rgba(255,255,255,0.92)" />
                          </div>
                        </div>

                        <div style={{ padding: 22 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                            <h3 style={{ fontSize: 18, fontWeight: 800, color: "white", margin: 0 }}>{video.title}</h3>
                            <span style={{ color: "#93C5FD", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>{video.audience}</span>
                          </div>
                          <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.62)", margin: "0 0 16px" }}>{video.desc}</p>
                          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14 }}>
                            <p style={{ margin: 0, color: "rgba(255,255,255,0.68)", fontSize: 13, lineHeight: 1.65 }}>
                              Best for: <strong style={{ color: "rgba(255,255,255,0.9)" }}>{video.audience}</strong>. This walkthrough gives a practical look at how the feature works in a real school workflow.
                            </p>
                          </div>
                          <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8, color: "#93C5FD", fontSize: 14, fontWeight: 700 }}>
                            Watch tutorial <ArrowRight size={14} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
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
