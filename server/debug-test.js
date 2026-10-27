test("carry-forward: basic scenario with v1 storage", async () => {
  const schoolId = "school-1";
  const db = new FakeDb({
    [`settings/${schoolId}`]: {
      schoolId,
      schoolName: "Test School",
      currentTerm: "Term 3",
      academicYear: "2025-2026",
      schoolReopenDate: "2026-01-10",
      vacationDate: "2026-07-20",
      nextTermBegins: "2026-09-10",
      termTransitionProcessed: false,
      financeVersion: "v1" // Explicitly set to v1
    },
    [`schools/${schoolId}`]: { name: "Test School", status: "active" },
    // Previous term fees (v1)
    "fees/tuition-root": {
      schoolId,
      feeName: "Tuition",
      amount: 500,
      term: "Term 3",
      academicYear: "2025-2026",
      feeFrequency: "per_term",
    },
    "fees/lunch-root": {
      schoolId,
      feeName: "Lunch",
      amount: 300,
      term: "Term 3",
      academicYear: "2025-2026",
      feeFrequency: "per_term",
    },
    // Previous term ledger with outstanding balance
    "student_ledgers/ledger-1": {
      schoolId,
      studentId: "student-1",
      classId: "class-1",
      term: "Term 3",
      academicYear: "2025-2026",
      fees: [
        { feeId: "tuition-root", feeName: "Tuition", amount: 500, openingPaidAmount: 0 },
        { feeId: "lunch-root", feeName: "Lunch", amount: 300, openingPaidAmount: 50 },
      ],
      openingPaidAmount: 50,
      openingBalance: 750,
      openingStatus: "Part-paid"
    },
    // Previous term payments (partial payment)
    "payments/payment-1": {
      schoolId,
      studentId: "student-1",
      amountPaid: 300,
      term: "Term 3",
      academicYear: "2025-2026",
      feeId: "tuition-root",
      isOpeningPayment: false
    }
  });
  
  const service = createTermRolloverService({
    db,
    FieldValue,
    Timestamp,
    logger: { 
      error: (msg) => console.error("ERROR:", msg),
      info: (msg) => console.info("INFO:", msg)
    },
  });

  const result = await service.rolloverSchool(schoolId, {
    now: new Date("2026-09-10T12:00:00"),
    source: "test",
  });

  console.log("Rollback result:", result);
  console.log("All records in db:");
  for (const [key, value] of db.records.entries()) {
    console.log(`  ${key}:`, typeof value === 'object' && value !== null ? JSON.stringify(value) : value);
  }

  assert.equal(result.changed, true);
  
  // Verify financial history preserved
  assert.equal(db.records.has("student_ledgers/ledger-1"), true);
  assert.equal(db.records.has("payments/payment-1"), true);
  assert.equal(db.records.has("fees/tuition-root"), true);
  assert.equal(db.records.has("fees/lunch-root"), true);
  
  // Debug: show all student_ledgers
  console.log("All student_ledgers:");
  for (const [key, value] of db.records.entries()) {
    if (key.startsWith("student_ledgers/")) {
      console.log(`  ${key}:`, typeof value === 'object' && value !== null ? JSON.stringify(value) : value);
    }
  }
  
  // Verify new term ledger created with carry-forward fee
  // Should be in v1 storage since financeVersion is v1
  const newTermLedgers = [...db.records.entries()]
    .filter(([key]) => key.startsWith("student_ledgers/") && 
                       key.endsWith(`_${schoolId}_student-1_2026-2027_Term1`))
    .map(([key, value]) => ({ id: key.split("/")[1], ...value }));
  
  console.log("New term ledgers found:", newTermLedgers.length);
  console.log("New term ledgers:", newTermLedgers);
  
  assert.equal(newTermLedgers.length, 1, "Should have exactly one new term ledger");
  const newTermLedger = newTermLedgers[0];
  
  assert.equal(newTermLedger.studentId, "student-1");
  assert.equal(newTermLedger.academicYear, "2026-2027");
  assert.equal(newTermLedger.term, "Term 1");
  assert.equal(newTermLedger.fees.length, 1); // Should have only the carry-forward fee
  assert.equal(newTermLedger.fees[0].feeName, "Carried Balance (Term 3, 2025-2026)");
  assert.equal(newTermLedger.fees[0].amount, 200); // GHS 500 - GHS 300 = GHS 200
  assert.equal(newTermLedger.fees[0].openingPaidAmount, 0);
  assert.equal(newTermLedger.fees[0].openingBalance, 200);
  assert.equal(newTermLedger.fees[0].openingStatus, "Unpaid");
  
  // Verify settings updated
  const settings = db.records.get(`settings/${schoolId}`);
  assert.equal(settings.currentTerm, "Term 1");
  assert.equal(settings.academicYear, "2026-2027");
  assert.equal(settings.termTransition.status, "completed");
  
  // Test idempotency - running again should not duplicate
  const secondRun = await service.rolloverSchool(schoolId, {
    now: new Date("2026-09-10T12:05:00"),
    source: "test",
  });
  assert.equal(secondRun.changed, false);
  assert.equal(secondRun.reason, "not_due");
  
  // Verify still only one carry-forward fee
  const newTermLedgersAfter = [...db.records.entries()]
    .filter(([key]) => key.startsWith("student_ledgers/") && 
                       key.endsWith(`_${schoolId}_student-1_2026-2027_Term1`))
    .map(([key, value]) => ({ id: key.split("/")[1], ...value }));
  
  assert.equal(newTermLedgersAfter.length, 1, "Should still have only one new term ledger");
  assert.equal(newTermLedgersAfter[0].fees.length, 1, "Should still have only one carry-forward fee");
}
