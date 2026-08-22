function acquireSingleInstanceLock(app, onSecondInstance) {
  const hasLock = app.requestSingleInstanceLock();

  if (!hasLock) {
    app.quit();
    return false;
  }

  app.on('second-instance', onSecondInstance);
  return true;
}

module.exports = { acquireSingleInstanceLock };
