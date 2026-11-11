# Based on https://docs.aws.amazon.com/emulator/latest/userguide/getting-started-docker.html
# AWS does not publish a prebuilt image.
FROM public.ecr.aws/amazonlinux/amazonlinux:2023-minimal
RUN rpm -i "https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS/latest/aws-emulator-$(uname -m).rpm" \
	&& mkdir -p /home/emulator && chown 1000 /home/emulator
USER 1000
ENV HOME=/home/emulator
EXPOSE 9297
ENTRYPOINT ["aws-emulator", "-b", "0.0.0.0"]
