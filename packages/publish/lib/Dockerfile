FROM nginx
LABEL name="<%= projectName %>-<%= branch %>"
LABEL version="latest"
COPY <%= buildOutPath %> /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d
EXPOSE <%= exposePort %>