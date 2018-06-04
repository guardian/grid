/* */ 
"format cjs";
  var ScopeScheduler = Rx.ScopeScheduler = (function () {

    var now = Date.now || (+new Date());

    function scheduleNow(state, action) {
      var scheduler = this,
        disposable = new SingleAssignmentDisposable();

      safeApply(disposable, scheduler, action, state);

      return disposable;
    }

    function scheduleRelative(state, dueTime, action) {
      var scheduler = this,
        dt = Rx.Scheduler.normalize(dueTime);

      if (dt === 0) {
        return scheduler.scheduleWithState(state, action);
      }

      var disposable = new SingleAssignmentDisposable();
      var id = setTimeout(function () {
        safeApply(disposable, scheduler, action, state);
      }, dt);

      return new CompositeDisposable(disposable, disposableCreate(function () {
        clearTimeout(id);
      }));
    }

    function safeApply(disposable, scheduler, action, state) {
      function fn() {
        !disposable.isDisposed && disposable.setDisposable(action(scheduler, state));
      }

      (scheduler._scope.$$phase || scheduler._scope.$root.$$phase)
        ? fn()
        : scheduler._scope.$apply(fn);
    }

    function scheduleAbsolute(state, dueTime, action) {
      return this.scheduleWithRelativeAndState(state, dueTime - this.now(), action);
    }

    return function (scope) {
      var scheduler = new Scheduler(now, scheduleNow, scheduleRelative, scheduleAbsolute);
      scheduler._scope = scope;
      return scheduler;
    }
  }());
