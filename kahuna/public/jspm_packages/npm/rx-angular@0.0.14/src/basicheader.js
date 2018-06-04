/* */ 
"format cjs";
  var observable = Rx.Observable,
    observableProto = observable.prototype,
    observableCreate = observable.create,
    disposableCreate = Rx.Disposable.create,
    SingleAssignmentDisposable = Rx.SingleAssignmentDisposable,
    CompositeDisposable = Rx.CompositeDisposable,
    AnonymousObservable = Rx.AnonymousObservable,
    Scheduler = Rx.Scheduler,
    noop = Rx.helpers.noop;

  // Utilities
  var toString = Object.prototype.toString,
    slice = Array.prototype.slice;
