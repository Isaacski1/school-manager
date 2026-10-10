  async set(data, options = {}) {
    const merge = options?.merge ?? false;
    if (merge && this.writtenData) {
      const clone = structuredClone({ ...this.writtenData, ...data });
      this.firestore.records.set(this.path, clone);
      this.writtenData = clone;
    } else {
      const clone = structuredClone(data);
      this.firestore.records.set(this.path, clone);
      this.writtenData = clone;
    }
  }