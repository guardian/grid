How to set up kubenetes grid
============================

This command 
```
kubectl create configmap auth --from-file=auth.conf=/Users/sihil/code/grid/kubenetes/auth.conf --from-file=aws-credentials=/Users/sihil/.aws/credentials -o yaml --dry-run | kubectl apply -f -
```