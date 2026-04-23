import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, ArrowLeft, ShieldCheck } from "lucide-react";
import PublicSiteLayout from "../../components/marketing/PublicSiteLayout";

const VerifyEmail = () => {
  return (
    <PublicSiteLayout>
      <section style={{ 
        minHeight: "80vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center", 
        padding: "80px 24px",
        background: "linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)"
      }}>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ 
            maxWidth: 500, 
            width: "100%", 
            background: "white", 
            borderRadius: 32, 
            padding: "48px 40px", 
            boxShadow: "0 20px 50px rgba(11,74,130,0.1)",
            border: "1.5px solid #DBEAFE",
            textAlign: "center"
          }}
        >
          <div style={{ 
            width: 80, 
            height: 80, 
            borderRadius: 24, 
            background: "#EFF6FF", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            margin: "0 auto 24px"
          }}>
            <Mail size={40} color="#0B4A82" />
          </div>

          <h1 style={{ fontSize: 32, fontWeight: 800, color: "#0f172a", marginBottom: 16 }}>
            Verify your email
          </h1>
          
          <p style={{ fontSize: 16, color: "#475569", lineHeight: 1.6, marginBottom: 32 }}>
            We've sent a verification link to your email address. 
            Please click the link in that email to activate your school workspace.
          </p>

          <div style={{ 
            background: "#F8FAFC", 
            borderRadius: 20, 
            padding: "20px", 
            border: "1px solid #E2E8F0",
            marginBottom: 32,
            display: "flex",
            alignItems: "center",
            gap: 12,
            textAlign: "left"
          }}>
            <ShieldCheck size={24} color="#16A34A" />
            <p style={{ fontSize: 14, color: "#64748B", margin: 0 }}>
              This helps us keep your school data secure and ensures only authorized admins can access the platform.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Link 
              to="/login" 
              style={{ 
                display: "block", 
                padding: "14px", 
                borderRadius: 999, 
                background: "linear-gradient(135deg, #0B4A82, #1160A8)", 
                color: "white", 
                fontWeight: 700, 
                textDecoration: "none",
                boxShadow: "0 4px 12px rgba(11,74,130,0.2)"
              }}
            >
              Go to Login
            </Link>
            
            <Link 
              to="/" 
              style={{ 
                display: "inline-flex", 
                alignItems: "center", 
                justifyContent: "center", 
                gap: 8, 
                color: "#64748B", 
                fontWeight: 600, 
                textDecoration: "none",
                fontSize: 14
              }}
            >
              <ArrowLeft size={16} /> Back to Home
            </Link>
          </div>
        </motion.div>
      </section>
    </PublicSiteLayout>
  );
};

export default VerifyEmail;
