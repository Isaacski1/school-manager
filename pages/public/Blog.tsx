import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Clock, User, BookOpen, TrendingUp, Shield, Users, Smartphone } from "lucide-react";
import PublicSiteLayout from "../../components/marketing/PublicSiteLayout";

const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const categories = ["All", "School Management", "Technology", "Parents & Teachers", "Tips & Guides"];

const posts = [
  {
    id: 1,
    category: "School Management",
    title: "Why Every Ghanaian School Needs a Digital Management System",
    excerpt: "Manual record-keeping is holding schools back. Discover how going digital transforms attendance, reports, and fee collection — and why it matters now.",
    author: "School Manager GH Team",
    readTime: "5 min read",
    image: "/blog-digital-management.png",
    icon: BookOpen,
    accent: "#93C5FD",
    featured: true,
    content: `In today's fast-paced world, schools that rely on paper-based systems are falling behind. From lost attendance records to delayed report cards, the problems are real — and solvable. A School Management System (SMS) centralises all your school's data: students, teachers, attendance, assessments, and fees — all in one secure, digital workspace. Ghana's schools are rapidly embracing digital tools, and the benefits are clear: faster report generation, fewer errors, happier parents, and more time for teachers to teach.`,
  },
  {
    id: 2,
    category: "Parents & Teachers",
    title: "How the Parent Dashboard Keeps Families Informed",
    excerpt: "Parents no longer need to visit the school to know how their child is doing. The parent portal gives real-time access to grades, attendance, and school notices.",
    author: "School Manager GH Team",
    readTime: "4 min read",
    image: "/blog-parent-dashboard.png",
    icon: Users,
    accent: "#86EFAC",
    featured: true,
    content: `Communication between schools and parents has traditionally been limited to report card day and parent-teacher meetings. With School Manager GH's Parent Dashboard, that changes entirely. Parents can log in anytime to see their child's attendance record, view assessment scores, check outstanding fees, and read school announcements — all without stepping foot in the school. This transparency builds trust, reduces administrative calls, and ensures every parent stays informed.`,
  },
  {
    id: 3,
    category: "Technology",
    title: "Cloud vs. On-Premise: Why Cloud-Based School Systems Win",
    excerpt: "Servers break, power goes out, hard drives fail. Cloud-based school management means your data is always safe, always accessible, and always backed up.",
    author: "School Manager GH Team",
    readTime: "6 min read",
    image: "/blog-cloud-vs-premise.png",
    icon: Shield,
    accent: "#C4B5FD",
    featured: false,
    content: `Many schools still run software on a single desktop or local server. When that machine crashes, years of student data can be lost. Cloud-based systems like School Manager GH store data securely on remote servers with automatic backups, so even if your internet goes down temporarily, your data is safe. You can access the platform from any device, anywhere — perfect for administrators who need flexibility.`,
  },
  {
    id: 4,
    category: "Tips & Guides",
    title: "5 Steps to Digitise Your School in Under a Week",
    excerpt: "Think switching to a digital system takes months? Think again. With the right platform, most schools are fully operational in under 5 days.",
    author: "School Manager GH Team",
    readTime: "7 min read",
    image: "/blog-digitise-steps.png",
    icon: TrendingUp,
    accent: "#FCA5A5",
    featured: false,
    content: `Step 1: Register your school and create your admin account. Step 2: Import your student and teacher lists. Step 3: Set up your classes and academic terms. Step 4: Invite teachers to start taking attendance. Step 5: Share parent login details with families. That's it — your school is live. School Manager GH's onboarding wizard handles the heavy lifting, so you spend less time setting up and more time running your school.`,
  },
  {
    id: 5,
    category: "School Management",
    title: "Understanding Report Cards: From Marks to Meaningful Insights",
    excerpt: "A report card is more than numbers. Learn how digital assessments, remarks, and skills tracking combine to paint a complete picture of every student.",
    author: "School Manager GH Team",
    readTime: "5 min read",
    image: "/blog-report-cards.png",
    icon: BookOpen,
    accent: "#93C5FD",
    featured: false,
    content: `Traditional report cards show marks in a table. Digital report cards go further — they include teacher remarks, skill assessments, attendance summaries, and grade comparisons across terms. School Manager GH automatically compiles all assessment data entered by teachers into a professional report card that can be downloaded as a PDF or shared digitally with parents. No more end-of-term rush to manually fill in hundreds of cards.`,
  },
  {
    id: 6,
    category: "Parents & Teachers",
    title: "Tips for Teachers: Getting the Most Out of Your Digital Classroom Tools",
    excerpt: "From quick attendance marking to entering assessment scores on the go, here are the best practices for teachers using a school management platform.",
    author: "School Manager GH Team",
    readTime: "4 min read",
    image: "/blog-teacher-tips.png",
    icon: Smartphone,
    accent: "#86EFAC",
    featured: false,
    content: `Digital tools only help when teachers use them consistently. Best practice #1: Mark attendance first thing every morning — it takes under 2 minutes. #2: Enter assessment scores within 24 hours while they're fresh. #3: Write student remarks progressively throughout the term, not all at once at the end. #4: Use the timetable view to plan your week. #5: Check the student performance dashboard monthly to identify struggling learners early.`,
  },
];

const Blog = () => {
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedPost, setSelectedPost] = useState<(typeof posts)[0] | null>(null);
  const [filterKey, setFilterKey] = useState(0);

  const filtered = activeCategory === "All" ? posts : posts.filter(p => p.category === activeCategory);
  const featured = posts.filter(p => p.featured);

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    setFilterKey(k => k + 1); // force instant re-render without stagger
  };

  return (
    <PublicSiteLayout>
      <style>{`
        @media (max-width: 768px) {
          .blog-hero-title { font-size: 34px !important; }
          .featured-grid { grid-template-columns: 1fr !important; }
          .posts-grid { grid-template-columns: 1fr !important; }
          .cat-scroll { flex-wrap: wrap !important; }
        }
      `}</style>

      {/* Hero */}
      <section style={{ padding: "100px 24px 60px", textAlign: "center" }}>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ display: "inline-flex", padding: "8px 20px", borderRadius: 999, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#93C5FD", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 20 }}>
            School Manager GH Blog
          </div>
          <h1 className="blog-hero-title" style={{ fontSize: "clamp(34px, 5vw, 56px)", fontWeight: 800, color: "white", margin: "0 0 20px 0", lineHeight: 1.1 }}>
            Insights for Modern Schools
          </h1>
          <p style={{ fontSize: 18, color: "rgba(255,255,255,0.7)", lineHeight: 1.7, margin: 0 }}>
            Practical guides, tips, and education technology insights to help Ghana's schools thrive in the digital age.
          </p>
        </motion.div>
      </section>

      {/* Featured Posts */}
      <section style={{ padding: "0 24px 80px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "#93C5FD", marginBottom: 24, letterSpacing: "0.15em" }}>Featured Articles</p>
          <div className="featured-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
            {featured.map((post, i) => {
              const Icon = post.icon;
              return (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  onClick={() => setSelectedPost(post)}
                  style={{
                    background: "rgba(255,255,255,0.04)", borderRadius: 28,
                    border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer",
                    transition: "all 0.3s", position: "relative", overflow: "hidden"
                  }}
                  whileHover={{ y: -6, borderColor: "rgba(255,255,255,0.2)" }}
                >
                  {/* Cover image */}
                  <div style={{ height: 200, overflow: "hidden", borderRadius: "28px 28px 0 0" }}>
                    <img src={post.image} alt={post.title} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.4s" }}
                      onMouseEnter={e => (e.currentTarget as HTMLImageElement).style.transform = "scale(1.04)"}
                      onMouseLeave={e => (e.currentTarget as HTMLImageElement).style.transform = "scale(1)"}
                    />
                  </div>
                  <div style={{ padding: 32 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${post.accent}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon size={18} color={post.accent} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: post.accent, textTransform: "uppercase", letterSpacing: "0.1em" }}>{post.category}</span>
                    </div>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: "white", margin: "0 0 14px", lineHeight: 1.3 }}>{post.title}</h2>
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.7, marginBottom: 24 }}>{post.excerpt}</p>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><User size={13} /> {post.author}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Clock size={13} /> {post.readTime}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: post.accent, fontSize: 14, fontWeight: 700 }}>
                        Read <ArrowRight size={14} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Category Filter */}
      <section style={{ padding: "0 24px 48px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div className="cat-scroll" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                style={{
                  padding: "9px 20px", borderRadius: 999, fontSize: 14, fontWeight: 600,
                  border: "1.5px solid", whiteSpace: "nowrap",
                  cursor: "pointer", transition: "all 0.2s",
                  borderColor: activeCategory === cat ? "#0B4A82" : "rgba(255,255,255,0.1)",
                  background: activeCategory === cat ? "#0B4A82" : "transparent",
                  color: activeCategory === cat ? "white" : "rgba(255,255,255,0.6)",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* All Posts */}
      <section style={{ padding: "0 24px 120px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          {/* Posts grid — no stagger so category switching is instant */}
          <div
            key={filterKey}
            className="posts-grid"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 28 }}
          >
            {filtered.map(post => {
              const Icon = post.icon;
              return (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.18 }}
                  whileHover={{ y: -6 }}
                  onClick={() => setSelectedPost(post)}
                  style={{
                    background: "rgba(255,255,255,0.03)", borderRadius: 24,
                    border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer",
                    transition: "all 0.3s", overflow: "hidden"
                  }}
                >
                  {/* Card Image */}
                  <div style={{ height: 180, overflow: "hidden" }}>
                    <img src={post.image} alt={post.title} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.4s" }}
                      onMouseEnter={e => (e.currentTarget as HTMLImageElement).style.transform = "scale(1.05)"}
                      onMouseLeave={e => (e.currentTarget as HTMLImageElement).style.transform = "scale(1)"}
                    />
                  </div>
                  <div style={{ padding: 28 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: post.accent, textTransform: "uppercase", letterSpacing: "0.1em" }}>{post.category}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "rgba(255,255,255,0.4)" }}><Clock size={12} /> {post.readTime}</span>
                    </div>
                    <h3 style={{ fontSize: 19, fontWeight: 700, color: "white", margin: "0 0 12px", lineHeight: 1.35 }}>{post.title}</h3>
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, marginBottom: 20 }}>{post.excerpt}</p>
                    <span style={{ color: post.accent, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, fontSize: 14 }}>Read more <ArrowRight size={13} /></span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Article Reader Modal */}
      {selectedPost && (
        <div
          onClick={() => setSelectedPost(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflowY: "auto" }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            style={{ background: "#041A2E", borderRadius: 28, padding: "48px 40px", maxWidth: 720, width: "100%", border: "1px solid rgba(255,255,255,0.12)", position: "relative", maxHeight: "90vh", overflowY: "auto" }}
          >
            <button onClick={() => setSelectedPost(null)} style={{ position: "absolute", top: 20, right: 20, width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "none", color: "white", fontSize: 18, cursor: "pointer" }}>×</button>
            <span style={{ fontSize: 12, fontWeight: 700, color: selectedPost.accent, textTransform: "uppercase", letterSpacing: "0.12em" }}>{selectedPost.category}</span>
            <h2 style={{ fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 800, color: "white", margin: "16px 0 12px", lineHeight: 1.3 }}>{selectedPost.title}</h2>
            <div style={{ display: "flex", gap: 20, fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 32 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><User size={13} /> {selectedPost.author}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Clock size={13} /> {selectedPost.readTime}</span>
            </div>
            <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 32 }} />
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.8)", lineHeight: 1.9 }}>{selectedPost.content}</p>
            <div style={{ marginTop: 48, padding: 28, background: "rgba(11,74,130,0.15)", borderRadius: 20, border: "1px solid rgba(11,74,130,0.3)" }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: "white", margin: "0 0 12px" }}>Ready to modernize your school?</p>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", margin: "0 0 20px" }}>Join schools across Ghana already using School Manager GH.</p>
              <Link to="/get-started" onClick={() => setSelectedPost(null)} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 28px", borderRadius: 999, background: "#0B4A82", color: "white", fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
                Register Your School <ArrowRight size={16} />
              </Link>
            </div>
          </motion.div>
        </div>
      )}

      {/* CTA */}
      <section style={{ padding: "0 24px 120px", textAlign: "center" }}>
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, color: "white", margin: "0 0 20px" }}>Start your school's digital journey</h2>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.6)", margin: "0 0 40px", lineHeight: 1.7 }}>Experience everything you've read about — register your school today, free for 30 days.</p>
          <Link to="/get-started" style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "18px 40px", borderRadius: 999, background: "#0B4A82", color: "white", fontWeight: 700, fontSize: 16, textDecoration: "none", boxShadow: "0 10px 30px rgba(0,0,0,0.3)" }}>
            Register Your School <ArrowRight size={18} />
          </Link>
        </motion.div>
      </section>
    </PublicSiteLayout>
  );
};

export default Blog;
