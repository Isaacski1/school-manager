import React from "react";
import Layout from "../../components/Layout";
import DailyCollectionsRegister from "../../components/finance/DailyCollections";

const TeacherDailyCollections: React.FC = () => (
  <Layout title="Daily Collections">
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <DailyCollectionsRegister teacherMode />
      </div>
    </div>
  </Layout>
);

export default TeacherDailyCollections;
